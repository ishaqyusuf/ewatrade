import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const DEFAULT_REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const REPO_ROOT = process.env.EXPO_ENV_ATTACHMENT_REPO_ROOT
  ? resolve(process.env.EXPO_ENV_ATTACHMENT_REPO_ROOT)
  : DEFAULT_REPO_ROOT
const MOBILE_DIR = process.env.EXPO_ENV_ATTACHMENT_MOBILE_DIR
  ? resolve(process.env.EXPO_ENV_ATTACHMENT_MOBILE_DIR)
  : join(REPO_ROOT, "apps/mobile")
const APP_CONFIG = join(MOBILE_DIR, "app.config.ts")
const EAS_JSON = join(MOBILE_DIR, "eas.json")
const MOBILE_LOCAL_ENV = join(MOBILE_DIR, ".env.local")
const MOBILE_PRODUCTION_ENV = join(MOBILE_DIR, ".env.production")
const EXPECTED_PROJECT_ID = "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"
const EXPECTED_OWNER = "cipron-startups"
const EXPECTED_SLUG = "ewatrade"
const ENVIRONMENTS = [
  {
    envFile: MOBILE_LOCAL_ENV,
    label: "development",
    listFile: process.env.EXPO_ENV_LIST_DEVELOPMENT_FILE,
    requiredKeys: [
      "APP_VARIANT",
      "EXPO_PUBLIC_APP_VARIANT",
      "EXPO_PUBLIC_BASE_URL",
      "EXPO_PUBLIC_API_URL",
      "EXPO_PUBLIC_API_PORT",
      "EXPO_PUBLIC_WEB_URL",
      "EXPO_PUBLIC_WEB_PORT",
      "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_WEB_CLIENT_ID",
      "GOOGLE_ANDROID_CLIENT_ID",
      "GOOGLE_IOS_CLIENT_ID",
      "EXPO_PORT",
    ],
    valueCheckedKeys: [
      "APP_VARIANT",
      "EXPO_PUBLIC_APP_VARIANT",
      "EXPO_PUBLIC_BASE_URL",
      "EXPO_PUBLIC_API_URL",
      "EXPO_PUBLIC_API_PORT",
      "EXPO_PUBLIC_WEB_URL",
      "EXPO_PUBLIC_WEB_PORT",
      "EXPO_PORT",
    ],
  },
  {
    envFile: MOBILE_PRODUCTION_ENV,
    label: "production",
    listFile: process.env.EXPO_ENV_LIST_PRODUCTION_FILE,
    requiredKeys: [
      "APP_VARIANT",
      "EXPO_PUBLIC_APP_VARIANT",
      "EXPO_PUBLIC_BASE_URL",
      "EXPO_PUBLIC_API_URL",
      "EXPO_PUBLIC_WEB_URL",
      "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_WEB_CLIENT_ID",
      "GOOGLE_ANDROID_CLIENT_ID",
      "GOOGLE_IOS_CLIENT_ID",
    ],
    valueCheckedKeys: [
      "APP_VARIANT",
      "EXPO_PUBLIC_APP_VARIANT",
      "EXPO_PUBLIC_BASE_URL",
      "EXPO_PUBLIC_API_URL",
      "EXPO_PUBLIC_WEB_URL",
    ],
  },
]

const failures = []

checkAppConfig()
checkEasJson()
checkEnvFiles()
checkExpoEnvLists()

if (failures.length > 0) {
  console.error(
    "Expo env attachment check failed. Keep EAS project identity and Expo environment variables aligned before release.",
  )

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Expo env attachment check passed.")

function checkAppConfig() {
  const content = readRequiredFile(APP_CONFIG)
  if (!content) return

  requireMarker(
    content,
    `const PROJECT_ID = "${EXPECTED_PROJECT_ID}"`,
    "app.config.ts must keep the Expo project id mapped to the published EwaTrade project.",
  )
  requireMarker(
    content,
    `slug: "${EXPECTED_SLUG}"`,
    "app.config.ts must keep slug ewatrade.",
  )
  requireMarker(
    content,
    `owner: "${EXPECTED_OWNER}"`,
    "app.config.ts must keep owner cipron-startups.",
  )
  requireMarker(
    content,
    "url: `https://u.expo.dev/${PROJECT_ID}`",
    "app.config.ts must keep expo-updates pointed at the EwaTrade project id.",
  )
}

function checkEasJson() {
  const content = readRequiredFile(EAS_JSON)
  if (!content) return

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    failures.push(`apps/mobile/eas.json is not valid JSON: ${error.message}`)
    return
  }

  if (parsed?.build?.development?.env?.APP_VARIANT !== "development") {
    failures.push(
      "eas.json development build must set APP_VARIANT=development.",
    )
  }

  if (parsed?.build?.production == null) {
    failures.push("eas.json must keep a production build profile.")
  }

  if (parsed?.build?.preview?.channel !== "preview") {
    failures.push("eas.json preview build must keep channel=preview.")
  }
}

function checkEnvFiles() {
  for (const environment of ENVIRONMENTS) {
    const env = readEnvFile(environment.envFile)

    for (const key of environment.requiredKeys) {
      if (!hasValue(env[key])) {
        failures.push(`${environment.label} mobile env is missing ${key}.`)
      }
    }

    if (env.APP_VARIANT !== environment.label) {
      failures.push(
        `${environment.label} mobile env must set APP_VARIANT=${environment.label}.`,
      )
    }

    if (env.EXPO_PUBLIC_APP_VARIANT !== environment.label) {
      failures.push(
        `${environment.label} mobile env must set EXPO_PUBLIC_APP_VARIANT=${environment.label}.`,
      )
    }
  }
}

function checkExpoEnvLists() {
  const verifyLive = process.env.EXPO_ENV_VERIFY_LIVE === "1"
  let verifiedAnyList = false

  for (const environment of ENVIRONMENTS) {
    const env = readEnvFile(environment.envFile)
    const listOutput = getExpoEnvListOutput(environment, verifyLive)
    if (!listOutput) continue

    verifiedAnyList = true
    const attached = parseEasEnvList(listOutput)
    const missing = environment.requiredKeys.filter((key) => {
      const entry = attached.get(key)
      return (
        !entry ||
        entry.scope !== "PROJECT" ||
        !entry.environments.includes(environment.label)
      )
    })

    if (missing.length > 0) {
      failures.push(
        `Expo ${environment.label} env is missing project-scoped keys: ${missing.join(
          ", ",
        )}.`,
      )
    }

    for (const key of environment.valueCheckedKeys) {
      const entry = attached.get(key)
      const expectedValue = env[key]
      if (!entry || !hasValue(expectedValue) || !hasValue(entry.value)) {
        continue
      }

      if (entry.value !== expectedValue) {
        failures.push(
          `Expo ${environment.label} env ${key} must be ${expectedValue}.`,
        )
      }
    }
  }

  if (!verifiedAnyList) {
    console.log(
      "External Expo env list verification skipped. Set EXPO_ENV_LIST_DEVELOPMENT_FILE and EXPO_ENV_LIST_PRODUCTION_FILE, or set EXPO_ENV_VERIFY_LIVE=1.",
    )
  }
}

function getExpoEnvListOutput(environment, verifyLive) {
  if (environment.listFile) {
    return readRequiredFile(resolve(environment.listFile))
  }

  if (!verifyLive) return null

  const result = spawnSync(
    "bunx",
    ["eas", "env:list", environment.label, "--format", "long"],
    {
      cwd: MOBILE_DIR,
      encoding: "utf8",
    },
  )

  if (result.error) {
    failures.push(
      `Could not run EAS env:list for ${environment.label}: ${result.error.message}`,
    )
    return null
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  if (result.status !== 0) {
    failures.push(
      `EAS env:list failed for ${environment.label}. Re-authenticate with Expo and rerun.`,
    )
    return output
  }

  return output
}

function parseEasEnvList(output) {
  const entries = new Map()
  const blocks = output.split(/———|\n-{3,}\n/g)

  for (const block of blocks) {
    const entry = {}

    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim()
      const match = /^(Name|Value|Scope|Visibility|Environments)\s+(.+)$/.exec(
        line,
      )
      if (!match) continue

      const [, label, value] = match
      if (label === "Name") entry.name = value.trim()
      if (label === "Value") entry.value = value.trim()
      if (label === "Scope") entry.scope = value.trim()
      if (label === "Visibility") entry.visibility = value.trim()
      if (label === "Environments") {
        entry.environments = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      }
    }

    if (entry.name) {
      entries.set(entry.name, {
        environments: entry.environments ?? [],
        scope: entry.scope ?? "",
        value: entry.value ?? "",
        visibility: entry.visibility ?? "",
      })
    }
  }

  return entries
}

function readRequiredFile(filePath) {
  if (!existsSync(filePath)) {
    failures.push(`${relative(REPO_ROOT, filePath)} is missing.`)
    return ""
  }

  return readFileSync(filePath, "utf8")
}

function readEnvFile(filePath) {
  const content = readRequiredFile(filePath)
  const values = {}

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = line.slice(equalsIndex + 1).trim()
    values[key] = stripQuotes(value)
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

function requireMarker(content, marker, message) {
  if (!content.includes(marker)) {
    failures.push(message)
  }
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0
}
