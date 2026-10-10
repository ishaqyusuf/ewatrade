/** Local-only adapter for the Al-Ghurobaa Whisper HTTP service. */
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import { stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { registerCacheCleanup, sweepCacheCleanup } from "./cache-cleanup"

const secret = process.env.ASSISTANT_VOICE_GATEWAY_SECRET ?? ""
const generation = process.env.ASSISTANT_VOICE_GENERATION ?? ""
const cacheRoot = process.env.ASSISTANT_WHISPER_CACHE_DIR
const whisper = new URL(
  process.env.ASSISTANT_WHISPER_URL ?? "http://127.0.0.1:8787",
)
const port = Number(process.env.ASSISTANT_VOICE_GATEWAY_PORT ?? 8790)
const language = process.env.ASSISTANT_WHISPER_LANGUAGE ?? "en"
if (
  secret.length < 32 ||
  !generation ||
  !cacheRoot ||
  !["127.0.0.1", "localhost", "[::1]"].includes(whisper.hostname) ||
  whisper.protocol !== "http:" ||
  whisper.username ||
  whisper.password
)
  throw new Error(
    "Configure gateway credentials, loopback Whisper URL and its exact cache directory.",
  )
const cache = resolve(cacheRoot)
for (const folder of ["audio", "clips", "transcripts"])
  if (!(await stat(join(cache, folder))).isDirectory())
    throw new Error("Whisper cache directory is invalid.")
await sweepCacheCleanup(cache)
setInterval(() => void sweepCacheCleanup(cache), 60_000).unref()
const hashes = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const nonces = new Map<string, number>()
const audio = new Map<string, { bytes: Uint8Array; type: string }>()
let busy = false
// Separate loopback server: this audio route is never forwarded by ngrok.
const downloads = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const value = audio.get(new URL(request.url).pathname)
    return value
      ? new Response(value.bytes, {
          headers: { "Content-Type": value.type, "Cache-Control": "no-store" },
        })
      : new Response(null, { status: 404 })
  },
})
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } })
Bun.serve({
  hostname: "127.0.0.1",
  port,
  maxRequestBodySize: 10 * 1024 * 1024,
  idleTimeout: 255,
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (
      !(path === "/health" && request.method === "GET") &&
      !(path === "/transcribe" && request.method === "POST")
    )
      return json({ error: "Not found" }, 404)
    const read = (name: string) => request.headers.get(`x-voice-${name}`) ?? ""
    const expires = Number(read("expires"))
    const nonce = read("nonce")
    const digest = read("digest")
    for (const [key, expiry] of nonces)
      if (expiry < Date.now()) nonces.delete(key)
    const expected = createHmac("sha256", secret)
      .update(`${path}\n${generation}\n${read("expires")}\n${nonce}\n${digest}`)
      .digest("hex")
    const signature = read("signature")
    if (
      read("generation") !== generation ||
      !Number.isFinite(expires) ||
      expires < Date.now() ||
      expires > Date.now() + 40_000 ||
      nonce.length !== 36 ||
      nonces.has(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return json({ error: "Unauthorized" }, 401)
    nonces.set(nonce, expires)
    if (nonces.size > 5000) return json({ error: "Busy" }, 429)
    let health: { ready?: boolean; model?: string }
    try {
      const response = await fetch(new URL("/health", whisper), {
        signal: AbortSignal.timeout(600),
        redirect: "error",
      })
      health = await response.json()
      if (!response.ok) throw new Error()
    } catch {
      return json({ ready: false, model: "unknown-local" }, 503)
    }
    if (path === "/health")
      return json({
        ready: Boolean(health.ready),
        model: health.model ?? "unknown-local",
        busy,
      })
    if (!health.ready || !health.model || busy)
      return json({ error: "Not ready" }, 503)
    const type = (request.headers.get("Content-Type") ?? "").split(";")[0] ?? ""
    const extensions: Record<string, string> = {
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
    }
    const extension = extensions[type]
    if (!extension || !/^[a-f0-9]{64}$/.test(digest))
      return json({ error: "Invalid audio" }, 400)
    busy = true
    const key = `/${randomUUID()}.${extension}`
    const audioUrl = `http://127.0.0.1:${downloads.port}${key}`
    // Exact Al-Ghurobaa cache keys, unique to this request. Never sweep another job.
    const downloadHash = hashes(audioUrl).slice(0, 16)
    const transcriptHash = hashes(
      `${audioUrl}|None|None|${language}|${health.model}|False`,
    )
    let cleanup: (() => Promise<void>) | undefined
    try {
      const bytes = new Uint8Array(await request.arrayBuffer())
      if (
        bytes.length === 0 ||
        bytes.length > 10 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex") !== digest
      )
        return json({ error: "Invalid audio" }, 400)
      cleanup = await registerCacheCleanup({
        cache,
        download: downloadHash,
        transcript: transcriptHash,
        extension: extension as "wav" | "webm" | "ogg" | "m4a" | "mp3",
        createdAt: Date.now(),
      })
      audio.set(key, { bytes, type })
      // Keep the slot until local work actually settles, even if the cloud caller
      // times out. This avoids overlapping local inferences during fallback.
      const response = await fetch(new URL("/transcribe", whisper), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl,
          language,
          wordTimestamps: false,
          force: true,
        }),
        redirect: "error",
      })
      if (!response.ok) {
        await response.body?.cancel()
        return json({ error: "Transcription failed" }, 503)
      }
      const result = (await response.json()) as {
        text?: string
        model?: string
        language?: string
        durationSeconds?: number
      }
      return json({
        text: result.text,
        model: result.model,
        language: result.language,
        durationSeconds: result.durationSeconds,
      })
    } catch {
      return json({ error: "Transcription failed" }, 503)
    } finally {
      audio.delete(key)
      await cleanup?.().catch(() =>
        console.warn("Voice cache cleanup deferred; the journal will retry."),
      )
      busy = false
    }
  },
})
console.info(
  "Voice gateway listening on loopback; request bodies and transcripts are not logged.",
)
