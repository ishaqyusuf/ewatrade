import { type ChildProcess, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { config, publisherProblem } from "./config"

const root = resolve(import.meta.dir, "../../..")
const settings = config(process.env, root)
let whisper: ChildProcess | undefined
let publisher: ChildProcess | undefined
let ownedCache: string | undefined
let stopped = false
let lastStatus = ""
let wake: (() => void) | undefined

function status(message: string) {
  if (message === lastStatus) return
  lastStatus = message
  console.info(`[wapi] ${message}`)
}

function start(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onExit: () => void,
) {
  // A private process group lets shutdown reap this service's descendants only.
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    detached: true,
  })
  child.once("error", () =>
    status(
      "A child could not start; check the configured executable. Retrying.",
    ),
  )
  child.once("close", onExit)
  return child
}

async function stopChild(child: ChildProcess | undefined) {
  if (!child?.pid) return
  const pid = child.pid
  const signal = (value: NodeJS.Signals) => {
    try {
      process.kill(-pid, value)
    } catch {
      /* Already stopped. */
    }
  }
  // Signal the parent first so the publisher can withdraw its lease.
  child.kill("SIGTERM")
  await Promise.race([
    new Promise<void>((done) =>
      child.exitCode !== null || child.signalCode !== null
        ? done()
        : child.once("close", () => done()),
    ),
    new Promise<void>((done) => setTimeout(done, 6500).unref()),
  ])
  signal("SIGKILL")
}

async function health() {
  try {
    const response = await fetch(new URL("/health", settings.url), {
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    })
    const body = (await response.json()) as {
      service?: string
      ready?: boolean
    }
    return body.service === "al-ghurobaa-local-transcriber"
      ? body.ready
        ? "ready"
        : "loading"
      : "foreign"
  } catch {
    return "offline"
  }
}

async function tick() {
  if (!settings.enabled)
    return status(
      "Disabled by ASSISTANT_VOICE_LOCAL_ENABLED=false. Restart after changing settings.",
    )
  const state = await health()
  if (stopped) return
  if (state !== "ready" && publisher) {
    await stopChild(publisher)
    publisher = undefined
    if (stopped) return
  }
  if (state === "foreign")
    return status(
      "Whisper port is occupied by another service; leaving it untouched.",
    )
  if (state === "offline" && !whisper) {
    if (
      !existsSync(resolve(settings.service, "main.py")) ||
      !existsSync(settings.python)
    ) {
      return status(
        "Install Al-Ghurobaa transcriber dependencies or set ASSISTANT_WHISPER_SERVICE_DIR / ASSISTANT_WHISPER_PYTHON. Cloud fallback remains available.",
      )
    }
    await mkdir(settings.cache, { recursive: true })
    if (stopped) return
    ownedCache = settings.cache
    status("Starting local Whisper; first model load may take time.")
    whisper = start(
      settings.python,
      [
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        settings.url.hostname === "[::1]" ? "::1" : "127.0.0.1",
        "--port",
        settings.url.port || "80",
      ],
      settings.service,
      {
        ...process.env,
        CACHE_DIR: settings.cache,
        PRELOAD_WHISPER: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        TRANSCRIPTION_QUEUE_WORKER_ENABLED: "0",
        TRANSCRIPTION_QUEUE_API_BASE_URL: "",
      },
      () => {
        whisper = undefined
        ownedCache = undefined
      },
    )
    return
  }
  if (state !== "ready")
    return status(
      "Waiting for Whisper readiness; cloud fallback remains available.",
    )
  const cache = ownedCache || settings.reuseCache
  if (!cache)
    return status(
      "Reusing running Whisper. Set ASSISTANT_WHISPER_CACHE_DIR to its exact cache before enabling the gateway.",
    )
  const problem = publisherProblem(process.env)
  if (problem)
    return status(`Whisper ready. ${problem} Restart after changing settings.`)
  if (!publisher) {
    status(
      "Whisper ready. Starting authenticated gateway and rotating ngrok publisher.",
    )
    publisher = start(
      process.execPath,
      [resolve(import.meta.dir, "start.ts")],
      root,
      {
        ...process.env,
        ASSISTANT_WHISPER_CACHE_DIR: cache,
      },
      () => {
        publisher = undefined
        status(
          "Publisher stopped; retrying in five seconds. Cloud fallback remains available.",
        )
      },
    )
  }
}

async function stop() {
  if (stopped) return
  stopped = true
  wake?.()
  await Promise.all([stopChild(publisher), stopChild(whisper)])
}
process.once("SIGINT", () => void stop())
process.once("SIGTERM", () => void stop())

while (!stopped) {
  try {
    await tick()
  } catch {
    status(
      "Local service unavailable; retrying. Cloud fallback remains available.",
    )
  }
  if (!stopped)
    await new Promise<void>((done) => {
      const timer = setTimeout(done, 5000)
      wake = () => {
        clearTimeout(timer)
        done()
      }
    })
}
