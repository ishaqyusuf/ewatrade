import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE =
  process.env.GOOGLE_OAUTH_READY_ENV_FILE ?? join(REPO_ROOT, ".env")
const EXAMPLE_ENV_FILE =
  process.env.GOOGLE_OAUTH_READY_EXAMPLE_ENV_FILE ??
  join(REPO_ROOT, ".env.example")
const DEBUG_KEYSTORE =
  process.env.GOOGLE_OAUTH_READY_DEBUG_KEYSTORE ??
  join(homedir(), ".android/debug.keystore")
const GOOGLE_CLOUD_CREDENTIALS_URL =
  "https://console.cloud.google.com/auth/clients?project=ewatrade-mobile-retail-ops"
const ANDROID_DEV_PACKAGE = "com.ewatrade.dev"
const ANDROID_DEV_SHA1 =
  "A7:A1:5D:42:BD:71:31:81:D3:F0:B0:57:75:F5:3C:9C:22:A1:99:34"
const IOS_BUNDLE_IDS = ["com.ewatrade.dev", "com.ewatrade.app"]
const GOOGLE_CLIENT_ID_PATTERN =
  /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/
const REQUIRED_GROUPS = [
  {
    keys: ["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID"],
    label: "Android mobile client ID",
    setupHint: `Create an Android OAuth client for package ${ANDROID_DEV_PACKAGE} with SHA-1 ${ANDROID_DEV_SHA1}.`,
  },
  {
    keys: ["GOOGLE_ANDROID_CLIENT_ID"],
    label: "API Android allowed audience",
    setupHint:
      "Copy the same Android OAuth client ID into the API audience key.",
  },
  {
    keys: ["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"],
    label: "iOS mobile client ID",
    setupHint: `Create an iOS OAuth client for bundle id ${IOS_BUNDLE_IDS.join(
      " or ",
    )}.`,
  },
  {
    keys: ["GOOGLE_IOS_CLIENT_ID"],
    label: "API iOS allowed audience",
    setupHint: "Copy the same iOS OAuth client ID into the API audience key.",
  },
  {
    keys: ["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_CLIENT_ID"],
    label: "Expo web or generic client ID",
    setupHint:
      "Create or reuse a Web OAuth client for Expo web/generic fallback.",
  },
  {
    keys: ["GOOGLE_WEB_CLIENT_ID", "GOOGLE_CLIENT_ID"],
    label: "API web or generic allowed audience",
    setupHint:
      "Copy the same web/generic OAuth client ID into the API audience key.",
  },
]
const REQUIRED_ENV_KEYS = Array.from(
  new Set(REQUIRED_GROUPS.flatMap((group) => group.keys)),
)

const env = readEnvFile(ENV_FILE)
const exampleEnv = readEnvFile(EXAMPLE_ENV_FILE)
const missingGroups = REQUIRED_GROUPS.filter(
  (group) => !group.keys.some((key) => hasValue(env[key])),
)
const missingExampleKeys = REQUIRED_ENV_KEYS.filter(
  (key) => !(key in exampleEnv),
)
const hasAllowedAudience = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_WEB_CLIENT_ID",
  "GOOGLE_ANDROID_CLIENT_ID",
  "GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
].some((key) => hasValue(env[key]))
const configuredGoogleKeys = REQUIRED_ENV_KEYS.filter((key) =>
  hasValue(env[key]),
)

const failures = []

if (!existsSync(ENV_FILE)) {
  failures.push("Missing repo .env file.")
}

if (!existsSync(EXAMPLE_ENV_FILE)) {
  failures.push("Missing repo .env.example file.")
}

if (missingExampleKeys.length > 0) {
  failures.push(
    `.env.example is missing documented Google OAuth keys: ${missingExampleKeys.join(
      ", ",
    )}.`,
  )
}

if (!hasAllowedAudience) {
  failures.push("No Google OAuth allowed audience is configured for the API.")
}

for (const key of configuredGoogleKeys) {
  const invalidValues = splitEnvList(env[key]).filter(
    (value) => !GOOGLE_CLIENT_ID_PATTERN.test(value),
  )

  if (invalidValues.length > 0) {
    failures.push(
      `${key} must contain Google OAuth client IDs ending in .apps.googleusercontent.com.`,
    )
  }
}

for (const group of missingGroups) {
  failures.push(
    `${group.label}: set one of ${group.keys.join(", ")}. ${group.setupHint}`,
  )
}

const androidMobileIds = splitEnvList(env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID)
const androidApiAudienceIds = splitEnvList(env.GOOGLE_ANDROID_CLIENT_ID)
if (
  androidMobileIds.length > 0 &&
  androidApiAudienceIds.length > 0 &&
  !androidMobileIds.every((clientId) =>
    androidApiAudienceIds.includes(clientId),
  )
) {
  failures.push(
    "API Android allowed audience must include the same client ID used by EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID.",
  )
}

const iosMobileIds = splitEnvList(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
const iosApiAudienceIds = splitEnvList(env.GOOGLE_IOS_CLIENT_ID)
if (
  iosMobileIds.length > 0 &&
  iosApiAudienceIds.length > 0 &&
  !iosMobileIds.every((clientId) => iosApiAudienceIds.includes(clientId))
) {
  failures.push(
    "API iOS allowed audience must include the same client ID used by EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.",
  )
}

const webMobileIds = [
  ...splitEnvList(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  ...splitEnvList(env.EXPO_PUBLIC_GOOGLE_CLIENT_ID),
]
const webApiAudienceIds = [
  ...splitEnvList(env.GOOGLE_WEB_CLIENT_ID),
  ...splitEnvList(env.GOOGLE_CLIENT_ID),
]
if (
  webMobileIds.length > 0 &&
  webApiAudienceIds.length > 0 &&
  !webMobileIds.every((clientId) => webApiAudienceIds.includes(clientId))
) {
  failures.push(
    "API web/generic allowed audience must include the same client ID used by the Expo web/generic Google key.",
  )
}

if (!existsSync(DEBUG_KEYSTORE)) {
  failures.push(
    "Android debug keystore is missing at ~/.android/debug.keystore; create it before Android dev OAuth QA.",
  )
}

if (failures.length > 0) {
  console.error("Google OAuth readiness check failed.")
  console.error(
    "Set the missing values, restart the API and Metro, then rerun this check.",
  )
  console.error(`Google Cloud credentials: ${GOOGLE_CLOUD_CREDENTIALS_URL}`)
  console.error(`Android dev package: ${ANDROID_DEV_PACKAGE}`)
  console.error(`Android dev SHA-1: ${ANDROID_DEV_SHA1}`)
  console.error(`iOS bundle IDs: ${IOS_BUNDLE_IDS.join(", ")}`)

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Google OAuth readiness check passed.")
console.log(`Google Cloud credentials: ${GOOGLE_CLOUD_CREDENTIALS_URL}`)
console.log(`Android dev package: ${ANDROID_DEV_PACKAGE}`)
console.log(`iOS bundle IDs: ${IOS_BUNDLE_IDS.join(", ")}`)
console.log("Restart the API and Metro before running live provider QA.")

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

function splitEnvList(value) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0
}
