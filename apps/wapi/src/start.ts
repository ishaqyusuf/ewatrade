import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { createInterface } from "node:readline"

import { createPublisher } from "./publisher"
import { environments, voiceTargets } from "./targets"

const targets = voiceTargets(process.env)
const generation = randomUUID()
const port = Number(process.env.ASSISTANT_VOICE_GATEWAY_PORT ?? 8790)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid gateway port")
let url: string | null = null
let stopped = false
const publisher = createPublisher(targets, generation)
console.info(
  `[wapi] Publishing to: ${targets.map((target) => target.environment).join(", ")}.`,
)
const missing = environments.filter(
  (environment) =>
    !targets.some((target) => target.environment === environment),
)
if (missing.length)
  console.warn(
    `[wapi] Environments not configured: ${missing.join(", ")}. Add them to ASSISTANT_VOICE_TARGETS_JSON.`,
  )
const gateway = spawn(
  process.execPath,
  [join(import.meta.dir, "local-gateway.ts")],
  {
    stdio: "inherit",
    env: { ...process.env, ASSISTANT_VOICE_GENERATION: generation },
  },
)
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

createInterface({ input: ngrok.stdout }).on("line", (line) => {
  try {
    const event = JSON.parse(line) as { url?: string; msg?: string }
    if (
      !stopped &&
      event.msg === "started tunnel" &&
      event.url &&
      /^https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)$/.test(event.url)
    ) {
      url = event.url
      void publisher.publish(url)
    }
  } catch {
    /* ngrok startup messages are not copied into application logs. */
  }
})
const timer = setInterval(() => {
  if (!stopped && url) void publisher.publish(url)
}, 60_000)
async function stop() {
  if (stopped) return
  stopped = true
  clearInterval(timer)
  if (url) await publisher.stop(url)
  gateway.kill("SIGTERM")
  ngrok.kill("SIGTERM")
}
process.on("SIGINT", () => void stop())
process.on("SIGTERM", () => void stop())
gateway.on("error", () => void stop())
ngrok.on("error", () => void stop())
gateway.on("exit", () => void stop())
ngrok.on("exit", () => void stop())
