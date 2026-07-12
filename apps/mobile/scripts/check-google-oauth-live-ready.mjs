import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ENV_FILE =
  process.env.GOOGLE_OAUTH_LIVE_READY_ENV_FILE ?? join(REPO_ROOT, ".env")
const EXAMPLE_ENV_FILE =
  process.env.GOOGLE_OAUTH_LIVE_READY_EXAMPLE_ENV_FILE ??
  join(REPO_ROOT, ".env.example")
const BASE_READY_SCRIPT = join(SCRIPT_DIR, "check-google-oauth-ready.mjs")
const REQUIRED_EXAMPLE_KEYS = [
  "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH",
  "EWATRADE_GOOGLE_LIVE_ID_TOKEN",
  "EWATRADE_GOOGLE_LIVE_MODE",
  "EWATRADE_GOOGLE_LIVE_EXPECTED_EMAIL",
  "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH",
  "EWATRADE_GOOGLE_LIVE_NAME",
  "EWATRADE_GOOGLE_LIVE_BUSINESS_NAME",
  "EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST",
]
const API_URL_KEYS = [
  "EWATRADE_API_URL",
  "NEXT_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_URL",
]
const failures = []
const env = readEnvFile(ENV_FILE)
const exampleEnv = readEnvFile(EXAMPLE_ENV_FILE)

if (!existsSync(ENV_FILE)) {
  failures.push("Missing repo .env file.")
}

if (!existsSync(EXAMPLE_ENV_FILE)) {
  failures.push("Missing repo .env.example file.")
}

const missingExampleKeys = REQUIRED_EXAMPLE_KEYS.filter(
  (key) => !(key in exampleEnv),
)
if (missingExampleKeys.length > 0) {
  failures.push(
    `.env.example is missing documented Google OAuth live QA keys: ${missingExampleKeys.join(
      ", ",
    )}.`,
  )
}

const selectedApiUrlKey = API_URL_KEYS.find((key) => hasValue(env[key]))
if (!selectedApiUrlKey) {
  failures.push(`Live API URL: set one of ${API_URL_KEYS.join(", ")}.`)
} else {
  validateApiUrl({
    allowLocalhost: env.EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST === "1",
    key: selectedApiUrlKey,
    value: env[selectedApiUrlKey],
  })
}

requireExactFlag({
  key: "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH",
  reason:
    "Set to 1 only when the selected API/database may receive a live Google auth verification that can create or update account/session records.",
})
requireValue("EWATRADE_GOOGLE_LIVE_ID_TOKEN", {
  minLength: 100,
  reason: "Paste a fresh Google ID token from the configured mobile client.",
})
requireValue("EWATRADE_GOOGLE_LIVE_EXPECTED_EMAIL", {
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  reason:
    "Used to verify the returned mobile auth profile without printing it.",
})
requireValue("EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH", {
  minLength: 6,
  reason:
    "Provide an absolute .json path where the live Google runner can save value-safe release evidence.",
})
validateEvidencePath()

const mode = env.EWATRADE_GOOGLE_LIVE_MODE?.trim()
if (!["login", "sign_up"].includes(mode)) {
  failures.push("EWATRADE_GOOGLE_LIVE_MODE must be either login or sign_up.")
}

if (mode === "sign_up") {
  requireValue("EWATRADE_GOOGLE_LIVE_NAME", {
    minLength: 2,
    reason: "Sign-up live QA should use a disposable owner name.",
  })
  requireValue("EWATRADE_GOOGLE_LIVE_BUSINESS_NAME", {
    minLength: 2,
    reason: "Sign-up live QA should use a disposable business name.",
  })
}

const baseReadinessResult = runBaseGoogleOAuthReadyCheck()
if (baseReadinessResult.status !== 0) {
  failures.push(
    "Base Google OAuth readiness failed. Run bun run --cwd apps/mobile qa:google-oauth-ready for client ID, API audience, and debug keystore details.",
  )
}

if (failures.length > 0) {
  console.error("Google OAuth live QA readiness check failed.")
  console.error(
    "Configure the missing values, restart the API and mobile app, then run the live Google OAuth QA flow.",
  )

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Google OAuth live QA readiness check passed.")
console.log(
  "Live Google OAuth QA can proceed against the configured API without printing Google or app bearer tokens.",
)

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {}

  const values = {}
  const content = readFileSync(filePath, "utf8")

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1).trim())
    values[key] = value
  }

  return values
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0
}

function requireExactFlag({ key, reason }) {
  if (env[key]?.trim() !== "1") {
    failures.push(`${key} must be set to 1. ${reason}`)
  }
}

function requireValue(key, { minLength = 1, pattern, reason }) {
  const value = env[key]?.trim()

  if (!value) {
    failures.push(`${key} is required. ${reason}`)
    return
  }

  if (value.includes("CHANGE_ME") || value.includes("example")) {
    failures.push(`${key} must be replaced with a real QA value. ${reason}`)
  }

  if (value.length < minLength) {
    failures.push(`${key} is too short. ${reason}`)
  }

  if (pattern && !pattern.test(value)) {
    failures.push(`${key} is malformed. ${reason}`)
  }
}

function validateApiUrl({ allowLocalhost, key, value }) {
  let url

  try {
    url = new URL(value)
  } catch {
    failures.push(`${key} must be a valid http(s) URL.`)
    return
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    failures.push(`${key} must use http or https.`)
  }

  const hostname = url.hostname.toLowerCase()
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost")

  if (isLocalhost && !allowLocalhost) {
    failures.push(
      `${key} points to localhost. Set EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST=1 only for local OAuth API fixtures.`,
    )
  }

  if (!allowLocalhost && url.protocol !== "https:") {
    failures.push(`${key} must use HTTPS for live Google OAuth QA.`)
  }
}

function validateEvidencePath() {
  const evidencePath = env.EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH?.trim()

  if (!evidencePath) return

  if (!isAbsolute(evidencePath)) {
    failures.push(
      "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH must be an absolute path.",
    )
  }

  if (!evidencePath.toLowerCase().endsWith(".json")) {
    failures.push(
      "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH must point to a .json file.",
    )
  }
}

function runBaseGoogleOAuthReadyCheck() {
  return spawnSync(process.execPath, [BASE_READY_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      GOOGLE_OAUTH_READY_ENV_FILE: ENV_FILE,
      GOOGLE_OAUTH_READY_EXAMPLE_ENV_FILE: EXAMPLE_ENV_FILE,
    },
  })
}
