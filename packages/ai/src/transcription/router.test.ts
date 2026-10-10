import { describe, expect, test } from "bun:test"
import {
  TranscriptionError,
  type VoiceAttempt,
  normalizeGatewayUrl,
} from "./contracts"
import { createFallbackTranscriber } from "./router"

const lease = {
  url: "https://voice-test.ngrok-free.app",
  generation: "c41b50a0-95d6-401d-85c2-2b547461ea84",
  expiresAt: Date.now() + 180_000,
  environment: "local",
}
function fixture(
  responses: Array<Response | Error>,
  options: {
    gateway?: typeof lease | null
    assertActive?: () => Promise<void>
    circuitOpen?: () => Promise<boolean>
    observeAttempt?: (attempt: VoiceAttempt) => Promise<void>
  } = {},
) {
  const attempts: VoiceAttempt[] = []
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const transcribe = createFallbackTranscriber({
    environment: {
      APP_ENV: "local",
      ASSISTANT_LOCAL_TENANT_IDS: "tenant",
      ASSISTANT_VOICE_GATEWAY_SECRET: "s".repeat(32),
      OPENAI_API_KEY: "test-only",
      ASSISTANT_XAI_API_KEY: "test-only",
    },
    contentType: "audio/wav",
    audioSeconds: 18,
    tenantId: "tenant",
    digest: "a".repeat(64),
    gateway: async () =>
      options.gateway === undefined ? lease : options.gateway,
    assertActive: options.assertActive ?? (async () => {}),
    recordAttempt: async (value) => {
      attempts.push({ ...value })
    },
    circuitOpen: options.circuitOpen,
    observeAttempt: options.observeAttempt,
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init })
      const result = responses.shift()
      if (!result) throw new Error("Unexpected network request")
      if (result instanceof Error) throw result
      return result
    }) as typeof fetch,
  })
  return {
    attempts,
    calls,
    run: () => transcribe({ audio: new Uint8Array([1, 2, 3]) }),
  }
}
const ok = (body: object) => Response.json(body)
describe("voice routing", () => {
  test("local succeeds with HMAC and no cloud calls", async () => {
    const f = fixture([
      ok({ ready: true, model: "whisper-large-v3-turbo" }),
      ok({ text: "Two crates", model: "whisper-large-v3-turbo" }),
    ])
    expect((await f.run()).provider).toBe("local_whisper")
    expect(f.calls).toHaveLength(2)
    expect(f.attempts.at(-1)?.estimatedCostMicros).toBe(0n)
    expect(
      new Headers(f.calls[1]?.init?.headers).get("x-voice-signature"),
    ).toMatch(/^[a-f0-9]{64}$/)
  })
  test("unready local, OpenAI outage, xAI succeeds in order", async () => {
    const f = fixture([
      ok({ ready: false, model: "whisper" }),
      new Response(null, { status: 503 }),
      ok({ text: "Five bags", duration: 18 }),
    ])
    expect((await f.run()).provider).toBe("xai")
    expect(f.calls.map((c) => c.url)).toEqual([
      `${lease.url}/health`,
      "https://api.openai.com/v1/audio/transcriptions",
      "https://api.x.ai/v1/stt",
    ])
    expect(
      f.attempts.filter((a) => a.outcome === "failed").map((a) => a.errorCode),
    ).toEqual(["PROVIDER_UNAVAILABLE"])
    expect(f.attempts.at(-1)?.billingStatus).toBe("unknown")
  })
  test("expired lease skips all tunnel requests", async () => {
    const f = fixture([ok({ text: "Hello" })], {
      gateway: { ...lease, expiresAt: 1 },
    })
    await f.run()
    expect(f.calls[0]?.url).toContain("openai.com")
    expect(f.attempts[1]?.outcome).toBe("skipped")
  })
  test("no speech is terminal and does not bill a second cloud", async () => {
    const f = fixture([ok({ text: "  " })], { gateway: null })
    await expect(f.run()).rejects.toMatchObject({ code: "NO_SPEECH" })
    expect(f.calls).toHaveLength(1)
  })
  test("revoked request never dispatches", async () => {
    const f = fixture([], {
      assertActive: async () => {
        throw new TranscriptionError("VOICE_CANCELLED", true)
      },
    })
    await expect(f.run()).rejects.toMatchObject({ code: "VOICE_CANCELLED" })
    expect(f.calls).toHaveLength(0)
  })
  test("all outages produce bounded terminal failure with redacted errors", async () => {
    const f = fixture([
      new Error("private url or body"),
      new Response("secret upstream", { status: 401 }),
      new Response("secret upstream", { status: 429 }),
    ])
    await expect(f.run()).rejects.toMatchObject({
      code: "ALL_PROVIDERS_FAILED",
    })
    expect(f.calls).toHaveLength(3)
    expect(JSON.stringify(f.attempts)).not.toContain("secret upstream")
  })
  test("rejects arbitrary URLs and redirects in gateway discovery", () => {
    for (const url of [
      "http://127.0.0.1",
      "https://evil.example",
      "https://x.ngrok-free.app/admin",
      "https://user:x@x.ngrok-free.app",
      "https://x.ngrok-free.app:444",
      "https://x.ngrok-free.app/?url=a",
    ])
      expect(normalizeGatewayUrl(url)).toBeNull()
  })
})

test("provider telemetry observes actual dispatch exactly once and cannot break fallback", async () => {
  const observed: string[] = []
  const f = fixture(
    [
      ok({ ready: false, model: "whisper" }),
      new Response(null, { status: 503 }),
      ok({ text: "Private speech" }),
    ],
    {
      observeAttempt: async (attempt) => {
        observed.push(`${attempt.provider}:${attempt.outcome}`)
        throw new Error("analytics offline")
      },
    },
  )
  expect((await f.run()).provider).toBe("xai")
  expect(observed).toEqual([
    "local_whisper:skipped",
    "openai:started",
    "openai:failed",
    "xai:started",
    "xai:success",
  ])
})
