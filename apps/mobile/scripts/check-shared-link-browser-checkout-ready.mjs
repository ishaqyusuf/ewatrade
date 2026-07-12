import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE =
  process.env.SHARED_LINK_BROWSER_READY_ENV_FILE ?? join(REPO_ROOT, ".env")
const EXAMPLE_ENV_FILE =
  process.env.SHARED_LINK_BROWSER_READY_EXAMPLE_ENV_FILE ??
  join(REPO_ROOT, ".env.example")
const REQUIRED_EXAMPLE_KEYS = [
  "EWATRADE_SHARED_LINK_PREVIEW_URL",
  "EWATRADE_SHARED_LINK_BROWSER_CONFIRM_ORDER",
  "EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_EMAIL",
  "EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_NAME",
  "EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_PASSWORD",
  "EWATRADE_SHARED_LINK_BROWSER_AUTH_MODE",
  "EWATRADE_SHARED_LINK_BROWSER_QUANTITY",
  "EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_PHONE",
  "EWATRADE_SHARED_LINK_BROWSER_NOTES",
  "EWATRADE_SHARED_LINK_BROWSER_SCREENSHOT_PATH",
  "EWATRADE_SHARED_LINK_BROWSER_HEADFUL",
  "EWATRADE_SHARED_LINK_BROWSER_ALLOW_LOCALHOST",
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
    `.env.example is missing documented shared-link browser checkout keys: ${missingExampleKeys.join(
      ", ",
    )}.`,
  )
}

const shareUrl = env.EWATRADE_SHARED_LINK_PREVIEW_URL?.trim()
if (!shareUrl) {
  failures.push(
    "EWATRADE_SHARED_LINK_PREVIEW_URL is required for browser checkout QA.",
  )
} else {
  validateShareUrl({
    allowLocalhost: env.EWATRADE_SHARED_LINK_BROWSER_ALLOW_LOCALHOST === "1",
    rawUrl: shareUrl,
  })
}

requireExactFlag({
  key: "EWATRADE_SHARED_LINK_BROWSER_CONFIRM_ORDER",
  reason:
    "Set to 1 only when the selected deployed product link may receive a disposable browser checkout order request.",
})
requireValue("EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_EMAIL", {
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  reason: "Use a disposable inbox for browser checkout QA.",
})
requireValue("EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_PASSWORD", {
  minLength: 8,
  reason: "Use a disposable password for the customer register/login branch.",
})

const authMode = env.EWATRADE_SHARED_LINK_BROWSER_AUTH_MODE?.trim()
if (!["login", "register"].includes(authMode)) {
  failures.push(
    "EWATRADE_SHARED_LINK_BROWSER_AUTH_MODE must be either register or login.",
  )
}

if (authMode !== "login") {
  requireValue("EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_NAME", {
    minLength: 2,
    reason: "Registration checkout needs a disposable customer name.",
  })
}

const quantity = env.EWATRADE_SHARED_LINK_BROWSER_QUANTITY?.trim()
if (quantity && (!/^\d+$/.test(quantity) || Number(quantity) < 1)) {
  failures.push(
    "EWATRADE_SHARED_LINK_BROWSER_QUANTITY must be a positive whole number when set.",
  )
}

requireValue("EWATRADE_SHARED_LINK_BROWSER_SCREENSHOT_PATH", {
  minLength: 5,
  reason:
    "Provide an absolute .png path where the browser checkout runner can save durable release evidence.",
})
validateScreenshotPath()

if (failures.length > 0) {
  console.error("Shared-link browser checkout readiness check failed.")
  console.error(
    "Configure the missing values, then run the guarded browser checkout QA flow.",
  )

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Shared-link browser checkout readiness check passed.")
console.log(
  "Browser checkout QA can proceed against the configured deployed product share URL.",
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

function validateShareUrl({ allowLocalhost, rawUrl }) {
  let url

  try {
    url = new URL(rawUrl)
  } catch {
    failures.push("EWATRADE_SHARED_LINK_PREVIEW_URL must be an absolute URL.")
    return
  }

  if (!url.pathname.startsWith("/p/")) {
    failures.push("EWATRADE_SHARED_LINK_PREVIEW_URL must use the /p/ path.")
  }

  if (!url.searchParams.get("share")) {
    failures.push("EWATRADE_SHARED_LINK_PREVIEW_URL must include share token.")
  }

  const hostname = url.hostname.toLowerCase()
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")

  if (isLocalhost && !allowLocalhost) {
    failures.push(
      "EWATRADE_SHARED_LINK_PREVIEW_URL points to localhost. Set EWATRADE_SHARED_LINK_BROWSER_ALLOW_LOCALHOST=1 only for local browser fixtures.",
    )
  }

  if (!allowLocalhost && url.protocol !== "https:") {
    failures.push("EWATRADE_SHARED_LINK_PREVIEW_URL must use HTTPS.")
  }
}

function validateScreenshotPath() {
  const screenshotPath =
    env.EWATRADE_SHARED_LINK_BROWSER_SCREENSHOT_PATH?.trim()

  if (!screenshotPath) return

  if (!isAbsolute(screenshotPath)) {
    failures.push(
      "EWATRADE_SHARED_LINK_BROWSER_SCREENSHOT_PATH must be an absolute path.",
    )
  }

  if (!screenshotPath.toLowerCase().endsWith(".png")) {
    failures.push(
      "EWATRADE_SHARED_LINK_BROWSER_SCREENSHOT_PATH must point to a .png file.",
    )
  }
}
