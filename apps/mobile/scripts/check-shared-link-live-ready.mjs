import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE =
  process.env.SHARED_LINK_LIVE_READY_ENV_FILE ?? join(REPO_ROOT, ".env")
const EXAMPLE_ENV_FILE =
  process.env.SHARED_LINK_LIVE_READY_EXAMPLE_ENV_FILE ??
  join(REPO_ROOT, ".env.example")
const REQUIRED_ENV_KEYS = [
  "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES",
  "EWATRADE_SHARED_LINK_LIVE_CONFIRM_EMAIL_DELIVERY",
  "EWATRADE_SHARED_LINK_LIVE_OWNER_BEARER_TOKEN",
  "EWATRADE_SHARED_LINK_LIVE_PRODUCT_ID",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_NAME",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_PASSWORD",
  "EWATRADE_SHARED_LINK_LIVE_FOLLOW_UP_MODE",
  "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH",
  "EWATRADE_SHARED_LINK_LIVE_QUANTITY",
  "EWATRADE_SHARED_LINK_LIVE_ALLOW_LOCALHOST",
]
const URL_GROUPS = [
  {
    keys: ["EWATRADE_API_URL", "NEXT_PUBLIC_API_URL", "EXPO_PUBLIC_API_URL"],
    label: "Live API URL",
    reason:
      "Needed to run protected tRPC share-link creation and follow-up from the configured owner session.",
  },
  {
    keys: [
      "EWATRADE_STOREFRONT_URL",
      "NEXT_PUBLIC_STOREFRONT_URL",
      "NEXT_PUBLIC_APP_URL",
    ],
    label: "Live storefront URL",
    reason:
      "Needed to open the generated public product link and submit the customer order request.",
  },
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

const missingExampleKeys = REQUIRED_ENV_KEYS.filter(
  (key) => !(key in exampleEnv),
)
if (missingExampleKeys.length > 0) {
  failures.push(
    `.env.example is missing documented shared-link live QA keys: ${missingExampleKeys.join(
      ", ",
    )}.`,
  )
}

for (const group of URL_GROUPS) {
  const selectedKey = group.keys.find((key) => hasValue(env[key]))

  if (!selectedKey) {
    failures.push(
      `${group.label}: set one of ${group.keys.join(", ")}. ${group.reason}`,
    )
    continue
  }

  validateUrlGroup({
    allowLocalhost: env.EWATRADE_SHARED_LINK_LIVE_ALLOW_LOCALHOST === "1",
    key: selectedKey,
    value: env[selectedKey],
  })
}

requireExactFlag({
  key: "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES",
  reason:
    "Set to 1 only when the selected API/storefront/database target is approved for a live shared-link order QA run.",
})
requireExactFlag({
  key: "EWATRADE_SHARED_LINK_LIVE_CONFIRM_EMAIL_DELIVERY",
  reason:
    "Set to 1 only when the selected email path is ready to verify customer and merchant notification delivery.",
})
requireValue("EWATRADE_SHARED_LINK_LIVE_OWNER_BEARER_TOKEN", {
  minLength: 20,
  reason:
    "Use a short-lived owner or manager mobile/API bearer token for protected product-link creation and follow-up.",
})
requireValue("EWATRADE_SHARED_LINK_LIVE_PRODUCT_ID", {
  minLength: 8,
  reason:
    "Use a synced production product id that has a sellable unit and enough stock for the disposable order.",
})
requireValue("EWATRADE_SHARED_LINK_LIVE_CUSTOMER_NAME", {
  minLength: 2,
  reason: "Use a disposable QA customer name for the public order request.",
})
requireValue("EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL", {
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  reason:
    "Use an inbox that can receive the public shared-link order confirmation.",
})
requireValue("EWATRADE_SHARED_LINK_LIVE_CUSTOMER_PASSWORD", {
  minLength: 8,
  reason:
    "Use a disposable QA password for the customer register/login branch of the public order request.",
})
requireValue("EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH", {
  minLength: 6,
  reason:
    "Provide an absolute .json path where the live shared-link runner can save value-safe release evidence.",
})
validateEvidencePath()

const followUpMode = env.EWATRADE_SHARED_LINK_LIVE_FOLLOW_UP_MODE?.trim()
if (!["cancel", "complete"].includes(followUpMode)) {
  failures.push(
    "EWATRADE_SHARED_LINK_LIVE_FOLLOW_UP_MODE must be either complete or cancel so live QA does not leave an ambiguous pending order request.",
  )
}

const quantity = env.EWATRADE_SHARED_LINK_LIVE_QUANTITY?.trim()
if (quantity && (!/^\d+$/.test(quantity) || Number(quantity) < 1)) {
  failures.push(
    "EWATRADE_SHARED_LINK_LIVE_QUANTITY must be a positive whole number when set.",
  )
}

const emailFrom = env.EMAIL_FROM?.trim()
if (!emailFrom) {
  failures.push(
    "EMAIL_FROM must be configured for live shared-link email notification delivery.",
  )
} else if (emailFrom.endsWith(".local")) {
  failures.push(
    "EMAIL_FROM must not use a .local sender for live shared-link email notification delivery.",
  )
}

if (!hasValue(env.EMAIL_REPLY_TO)) {
  failures.push(
    "EMAIL_REPLY_TO must be configured so merchant-facing shared-link emails have a reply path.",
  )
}

if (failures.length > 0) {
  console.error("Shared-link live readiness check failed.")
  console.error(
    "Configure the missing values, restart the API/storefront/mobile processes, then run the live shared-link QA flow.",
  )

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Shared-link live readiness check passed.")
console.log(
  "Live shared-link QA can proceed with protected link creation, public order request, notification delivery, pending-request follow-up, and database/audit verification.",
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

function validateUrlGroup({ allowLocalhost, key, value }) {
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
    hostname.endsWith(".local")

  if (isLocalhost && !allowLocalhost) {
    failures.push(
      `${key} points to a local host. Set EWATRADE_SHARED_LINK_LIVE_ALLOW_LOCALHOST=1 only for an intentional local live-QA rehearsal; production/database-write QA should use deployed URLs.`,
    )
  }
}

function validateEvidencePath() {
  const evidencePath = env.EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH?.trim()

  if (!evidencePath) return

  if (!isAbsolute(evidencePath)) {
    failures.push(
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH must be an absolute path.",
    )
  }

  if (!evidencePath.toLowerCase().endsWith(".json")) {
    failures.push(
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH must point to a .json file.",
    )
  }
}
