import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"

const registry = new URL(process.env.ASSISTANT_VOICE_REGISTRY_URL ?? "")
const token = process.env.ASSISTANT_VOICE_PUBLISH_SECRET ?? ""
const environment =
  process.env.ASSISTANT_VOICE_TARGET_ENV || process.env.APP_ENV
if (
  registry.protocol !== "https:" ||
  registry.pathname !== "/api/assistant/voice/gateway" ||
  token.length < 32 ||
  !environment
)
  throw new Error(
    "Configure the HTTPS voice registry, publish secret and target environment.",
  )
const generation = randomUUID()
const port = process.env.ASSISTANT_VOICE_GATEWAY_PORT ?? "8790"
if (!/^\d{4,5}$/.test(port)) throw new Error("Invalid gateway port")
let url: string | null = null
let previousGeneration: string | null = null
let stopped = false
let publishing = false
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
}
try {
  const response = await fetch(registry, {
    headers,
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  })
  if (!response.ok) throw new Error()
  const current = (await response.json()) as { lease?: { generation?: string } }
  previousGeneration = current.lease?.generation ?? null
} catch {
  throw new Error("Voice registry is unreachable or refused the publisher.")
}
const gateway = spawn("bun", ["scripts/assistant-voice/local-gateway.ts"], {
  stdio: "inherit",
  env: { ...process.env, ASSISTANT_VOICE_GENERATION: generation },
})
const ngrok = spawn(
  "ngrok",
  [
    "http",
    `http://127.0.0.1:${port}`,
    "--inspect=false",
    "--log",
    "stdout",
    "--log-format",
    "json",
  ],
  { stdio: ["ignore", "pipe", "ignore"] },
)

async function publish(remove = false) {
  if (!url || publishing) return
  publishing = true
  try {
    const response = await fetch(registry, {
      method: remove ? "DELETE" : "PUT",
      headers,
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      body: JSON.stringify({
        url,
        generation,
        previousGeneration,
        environment,
      }),
    })
    if (!response.ok) {
      console.warn(
        "Voice registration refused; cloud fallback remains available.",
      )
      return
    }
    previousGeneration = generation
    if (!remove) console.info("Voice gateway lease renewed.")
  } catch {
    console.warn("Voice registration unavailable; stale lease will expire.")
  } finally {
    publishing = false
  }
}
createInterface({ input: ngrok.stdout }).on("line", (line) => {
  try {
    const event = JSON.parse(line) as { url?: string; msg?: string }
    if (
      event.msg === "started tunnel" &&
      event.url &&
      /^https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)$/.test(event.url)
    ) {
      url = event.url
      void publish()
    }
  } catch {
    /* ngrok startup messages are not copied into application logs. */
  }
})
const timer = setInterval(() => {
  if (!stopped) void publish()
}, 60_000)
async function stop() {
  if (stopped) return
  stopped = true
  clearInterval(timer)
  await publish(true)
  gateway.kill("SIGTERM")
  ngrok.kill("SIGTERM")
}
process.on("SIGINT", () => void stop())
process.on("SIGTERM", () => void stop())
gateway.on("error", () => void stop())
ngrok.on("error", () => void stop())
gateway.on("exit", () => void stop())
ngrok.on("exit", () => void stop())
