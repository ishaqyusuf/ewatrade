import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createTRPCClient, httpLink } from "@trpc/client"
import superjson from "superjson"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ENV_FILE =
  process.env.GOOGLE_OAUTH_LIVE_ENV_FILE ?? join(REPO_ROOT, ".env")
const API_URL_KEYS = [
  "EWATRADE_API_URL",
  "NEXT_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_URL",
]

loadEnvFile(ENV_FILE)
runReadinessCheck()

try {
  await runGoogleOAuthLiveQa()
} catch (error) {
  console.error("Google OAuth live QA failed.")
  console.error(`- ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

async function runGoogleOAuthLiveQa() {
  const apiUrl = pickEnv(API_URL_KEYS)
  const expectedEmail = requireEnv(
    "EWATRADE_GOOGLE_LIVE_EXPECTED_EMAIL",
  ).toLowerCase()
  const evidencePath = requireEnv("EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH")
  const mode = getMode()
  const input = {
    businessName:
      mode === "sign_up"
        ? requireEnv("EWATRADE_GOOGLE_LIVE_BUSINESS_NAME")
        : undefined,
    idToken: requireEnv("EWATRADE_GOOGLE_LIVE_ID_TOKEN"),
    mode,
    name:
      mode === "sign_up" ? requireEnv("EWATRADE_GOOGLE_LIVE_NAME") : undefined,
  }
  const trpc = createTRPCClient({
    links: [
      httpLink({
        transformer: superjson,
        url: `${apiUrl.replace(/\/+$/, "")}/api/trpc`,
      }),
    ],
  })

  const result = await trpc.auth.verifyMobileGoogle.mutate(input)

  if (!result?.token || typeof result.token !== "string") {
    throw new Error("API did not return a mobile bearer token.")
  }

  if (result.profile?.email?.toLowerCase() !== expectedEmail) {
    throw new Error(
      "Returned mobile profile email did not match expected email.",
    )
  }

  if (!result.profile?.businessId || !result.profile?.businessName) {
    throw new Error("Returned mobile profile is missing business context.")
  }

  if (!result.tenant?.id || result.tenant.id !== result.profile.businessId) {
    throw new Error("Returned tenant context did not match the mobile profile.")
  }

  console.log("Google OAuth live QA passed.")
  console.log(
    `Verified ${mode} profile for ${result.profile.email} in business ${result.profile.businessName}.`,
  )
  console.log("Google ID token and returned bearer token were not printed.")
  writeLiveEvidence({
    apiUrl,
    evidencePath,
    expectedEmail,
    mode,
    result,
  })
}

function runReadinessCheck() {
  const result = spawnSync(
    process.execPath,
    [join(SCRIPT_DIR, "check-google-oauth-live-ready.mjs")],
    {
      env: {
        ...process.env,
        GOOGLE_OAUTH_LIVE_READY_ENV_FILE: ENV_FILE,
      },
      stdio: "inherit",
    },
  )

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return

  const content = readFileSync(filePath, "utf8")

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1).trim())

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
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

function requireEnv(key) {
  const value = process.env[key]?.trim()

  if (!value) {
    throw new Error(`${key} is required.`)
  }

  return value
}

function pickEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }

  throw new Error(`Set one of ${keys.join(", ")}.`)
}

function getMode() {
  return process.env.EWATRADE_GOOGLE_LIVE_MODE?.trim() === "sign_up"
    ? "sign_up"
    : "login"
}

function writeLiveEvidence({
  apiUrl,
  evidencePath,
  expectedEmail,
  mode,
  result,
}) {
  const evidence = {
    apiOrigin: new URL(apiUrl).origin,
    checkedAt: new Date().toISOString(),
    mode,
    profile: {
      businessContextVerified: Boolean(
        result.profile?.businessId && result.profile?.businessName,
      ),
      emailDomain: expectedEmail.split("@")[1] ?? "",
      emailMatched: result.profile?.email?.toLowerCase() === expectedEmail,
      role: result.profile?.role ?? null,
      status: result.profile?.status ?? null,
    },
    session: {
      bearerTokenReturned:
        typeof result.token === "string" && result.token.length > 0,
      expiresAt: result.expiresAt ?? null,
    },
    tenant: {
      idMatchesProfile: result.tenant?.id === result.profile?.businessId,
      role: result.tenant?.role ?? null,
      status: result.tenant?.status ?? null,
    },
    verification: "auth.verifyMobileGoogle",
  }

  mkdirSync(dirname(evidencePath), { recursive: true })
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(`Google OAuth live evidence: ${evidencePath}`)
}
