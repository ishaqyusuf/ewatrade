import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const ROOT_LOCAL_ENV = join(REPO_ROOT, ".env")
const ROOT_PRODUCTION_ENV = join(REPO_ROOT, ".env.production")
const ROOT_EXAMPLE_ENV = join(REPO_ROOT, ".env.example")
const MOBILE_LOCAL_ENV = join(MOBILE_DIR, ".env.local")
const MOBILE_PRODUCTION_ENV = join(MOBILE_DIR, ".env.production")
const MOBILE_EXAMPLE_ENV = join(MOBILE_DIR, ".env.example")
const BANNED_ENV_MARKERS = [/gnd/i, /gndprodesk/i, /versadesk/i]
const ROOT_EXAMPLE_KEYS = [
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "STOREFRONT_URL",
  "NEXT_PUBLIC_STOREFRONT_URL",
  "NEXT_PUBLIC_APP_URL",
  "MOBILE_APP_URL",
  "NEXT_PUBLIC_MARKETING_URL",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "NEXT_PUBLIC_PLATFORM_DOMAIN",
  "PLATFORM_DOMAIN",
  "ALLOWED_API_ORIGINS",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "MARKETING_INBOX_EMAILS",
  "RESEND_API_KEY",
  "SKIP_OTP",
  "TEST_EMAILS",
  "TEST_EMAIL",
]
const MOBILE_EXAMPLE_KEYS = [
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
  "SKIP_OTP",
  "EXPO_PORT",
]
const EXPECTED = [
  {
    checks: {
      ALLOWED_API_ORIGINS: includesAll([
        "http://localhost:3092",
        "http://localhost:3094",
        "http://localhost:3095",
      ]),
      BETTER_AUTH_TRUSTED_ORIGINS: includesAll([
        "http://localhost:3092",
        "http://localhost:3094",
        "http://localhost:3095",
      ]),
      EMAIL_FROM: nonLocalEmailLike,
      EMAIL_REPLY_TO: nonLocalEmailLike,
      RESEND_API_KEY: startsWith("re_"),
      API_URL: equals("http://localhost:3095"),
      MOBILE_APP_URL: equals("http://localhost:3096"),
      PLATFORM_DOMAIN: equals("localhost:3092"),
      SKIP_OTP: equals("1"),
      STOREFRONT_URL: equals("http://localhost:3092"),
      MARKETING_INBOX_EMAILS: nonLocalEmailLike,
      NEXT_PUBLIC_API_URL: equals("http://localhost:3095"),
      NEXT_PUBLIC_APP_URL: equals("http://localhost:3092"),
      NEXT_PUBLIC_DASHBOARD_URL: equals("http://localhost:3094"),
      NEXT_PUBLIC_PLATFORM_DOMAIN: equals("localhost:3092"),
      NEXT_PUBLIC_MARKETING_URL: equals("http://localhost:3092"),
      NEXT_PUBLIC_STOREFRONT_URL: equals("http://localhost:3092"),
    },
    file: ROOT_LOCAL_ENV,
    label: "root local env",
    testEmailRecipients: testEmailRecipients(nonLocalEmailLike),
  },
  {
    checks: {
      ALLOWED_API_ORIGINS: includesAll([
        "https://ewatrade.com",
        "https://dashboard.ewatrade.com",
      ]),
      BETTER_AUTH_TRUSTED_ORIGINS: includesAll([
        "https://ewatrade.com",
        "https://dashboard.ewatrade.com",
      ]),
      EMAIL_FROM: productionEmail,
      EMAIL_REPLY_TO: productionEmail,
      RESEND_API_KEY: startsWith("re_"),
      API_URL: equals("https://ewatrade.com"),
      MOBILE_APP_URL: equals("https://ewatrade.com/download"),
      PLATFORM_DOMAIN: equals("ewatrade.com"),
      SKIP_OTP: equals("0"),
      STOREFRONT_URL: equals("https://ewatrade.com"),
      MARKETING_INBOX_EMAILS: productionEmail,
      NEXT_PUBLIC_API_URL: equals("https://ewatrade.com"),
      NEXT_PUBLIC_APP_URL: equals("https://ewatrade.com"),
      NEXT_PUBLIC_DASHBOARD_URL: equals("https://dashboard.ewatrade.com"),
      NEXT_PUBLIC_PLATFORM_DOMAIN: equals("ewatrade.com"),
      NEXT_PUBLIC_MARKETING_URL: equals("https://ewatrade.com"),
      NEXT_PUBLIC_SIGNUP_ENABLED: equals("true"),
      NEXT_PUBLIC_STOREFRONT_URL: equals("https://ewatrade.com"),
    },
    file: ROOT_PRODUCTION_ENV,
    label: "root production env",
    testEmailRecipients: testEmailRecipients(productionEmail),
  },
  {
    checks: {
      APP_VARIANT: equals("development"),
      EXPO_PORT: equals("3096"),
      EXPO_PUBLIC_API_PORT: equals("3095"),
      EXPO_PUBLIC_API_URL: equals("http://localhost:3095"),
      EXPO_PUBLIC_APP_VARIANT: equals("development"),
      EXPO_PUBLIC_BASE_URL: equals("http://localhost:3092"),
      EXPO_PUBLIC_WEB_PORT: equals("3092"),
      EXPO_PUBLIC_WEB_URL: equals("http://localhost:3092"),
      SKIP_OTP: equals("1"),
    },
    file: MOBILE_LOCAL_ENV,
    label: "mobile local env",
  },
  {
    checks: {
      APP_VARIANT: equals("production"),
      EXPO_PUBLIC_API_URL: equals("https://ewatrade.com"),
      EXPO_PUBLIC_APP_VARIANT: equals("production"),
      EXPO_PUBLIC_BASE_URL: equals("https://ewatrade.com"),
      EXPO_PUBLIC_WEB_URL: equals("https://ewatrade.com"),
      SKIP_OTP: equals("0"),
    },
    file: MOBILE_PRODUCTION_ENV,
    label: "mobile production env",
  },
]

const failures = []

for (const config of EXPECTED) {
  const env = readEnvFile(config.file)

  for (const [key, check] of Object.entries(config.checks)) {
    if (!hasValue(env[key])) {
      failures.push(`${config.label}: ${key} is missing.`)
      continue
    }

    const result = check(env[key])
    if (result !== true) {
      failures.push(`${config.label}: ${key} ${result}`)
    }
  }

  if (config.testEmailRecipients) {
    const result = config.testEmailRecipients(env)

    if (result !== true) {
      failures.push(`${config.label}: ${result}`)
    }
  }
}

checkExampleKeys(ROOT_EXAMPLE_ENV, ROOT_EXAMPLE_KEYS)
checkExampleKeys(MOBILE_EXAMPLE_ENV, MOBILE_EXAMPLE_KEYS)
checkBannedMarkers([
  ROOT_LOCAL_ENV,
  ROOT_PRODUCTION_ENV,
  ROOT_EXAMPLE_ENV,
  MOBILE_LOCAL_ENV,
  MOBILE_PRODUCTION_ENV,
  MOBILE_EXAMPLE_ENV,
])

if (failures.length > 0) {
  console.error(
    "Mobile env config check failed. Keep local, production, and Expo env values explicit and Ewatrade-specific.",
  )

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Mobile env config check passed.")

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    failures.push(`${relative(REPO_ROOT, filePath)} is missing.`)
    return {}
  }

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

function equals(expected) {
  return (value) => (value.trim() === expected ? true : `must be ${expected}.`)
}

function includesAll(expectedValues) {
  return (value) => {
    const configured = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    const missing = expectedValues.filter(
      (expected) => !configured.includes(expected),
    )

    return missing.length === 0 ? true : `must include ${missing.join(", ")}.`
  }
}

function startsWith(expectedPrefix) {
  return (value) =>
    value.trim().startsWith(expectedPrefix)
      ? true
      : `must start with ${expectedPrefix}.`
}

function testEmailRecipients(checkEmail) {
  return (env) => {
    const configured = hasValue(env.TEST_EMAILS)
      ? env.TEST_EMAILS
      : env.TEST_EMAIL
    const recipients =
      configured
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? []

    if (recipients.length === 0) {
      return "TEST_EMAILS or TEST_EMAIL is missing."
    }

    for (const recipient of recipients) {
      const result = checkEmail(recipient)

      if (result !== true) {
        return `TEST_EMAILS/TEST_EMAIL recipient ${recipient} ${result}`
      }
    }

    return true
  }
}

function nonLocalEmailLike(value) {
  if (value.includes(".local")) {
    return "must not use a .local address."
  }

  return /@/.test(value) ? true : "must include an email address."
}

function productionEmail(value) {
  if (value.includes(".local") || value.includes(".test")) {
    return "must use a production email domain."
  }

  return /@ewatrade\.com\b/.test(value)
    ? true
    : "must use an ewatrade.com address."
}

function checkExampleKeys(filePath, requiredKeys) {
  const env = readEnvFile(filePath)
  const missingKeys = requiredKeys.filter((key) => !(key in env))

  if (missingKeys.length > 0) {
    failures.push(
      `${relative(REPO_ROOT, filePath)} is missing documented keys: ${missingKeys.join(
        ", ",
      )}.`,
    )
  }
}

function checkBannedMarkers(filePaths) {
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, "utf8")

    for (const marker of BANNED_ENV_MARKERS) {
      if (!marker.test(content)) continue

      failures.push(
        `${relative(REPO_ROOT, filePath)} contains stale copied env marker ${marker}.`,
      )
    }
  }
}
