/** Read-only OTP release preflight. Never creates a challenge or sends a message. */
import { resolve } from "node:path"
import { readWhatsAppOtpConfig } from "../packages/communications/src/whatsapp-otp"
import { isLocalPhoneAuth } from "../packages/db/src/queries/phone-auth-profile"
import { accountPrivacyEmailIntakeFailures } from "../packages/utils/src/account-privacy-intake"
import { isTrustedClientIpHeaderConfigured } from "../packages/utils/src/qa-network-source"
import { readEnvironmentFile } from "./environment-profile.mjs"
import { validateProductionApiConfiguration } from "./production-api-readiness.mjs"

type Environment = Record<string, string | undefined>
const sender = {
  WHATSAPP_OTP_PHONE_NUMBER_ID: "1392318457295932",
  WHATSAPP_OTP_TEMPLATE_NAME: "ewatrade_login_otp",
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: "en_US",
}

export function phoneAuthReleaseReadiness(
  server: Environment,
  mobile: Environment,
) {
  const failures: string[] = []
  const pending: string[] = []
  const api = validateProductionApiConfiguration(server, mobile)
  failures.push(...api.failures)
  if (server.APP_ENV !== "production" || isLocalPhoneAuth(server))
    failures.push(
      "Use the production profile; local fixed codes are forbidden.",
    )
  if (server.WHATSAPP_OTP_ENABLED !== "false")
    failures.push("WHATSAPP_OTP_ENABLED must explicitly remain false.")
  for (const [key, expected] of Object.entries(sender)) {
    if (server[key] !== expected)
      failures.push(`${key} must match the approved OTP sender/template.`)
  }
  const secret = server.BETTER_AUTH_SECRET ?? server.AUTH_SECRET
  if ((secret?.trim().length ?? 0) < 32)
    failures.push("The server authentication secret is missing or too short.")
  if (
    !isTrustedClientIpHeaderConfigured(
      server.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER,
    )
  )
    failures.push(
      "Configure a trusted privacy ingress header for send budgets.",
    )
  failures.push(...accountPrivacyEmailIntakeFailures(server))
  if (server.QA_ACCELERATOR_ENABLED === "true")
    failures.push("QA accelerator must not be enabled in production.")
  if (mobile.EXPO_PUBLIC_APP_VARIANT !== "production")
    failures.push("Mobile must select the production app variant.")
  if (mobile.EXPO_PUBLIC_LEGAL_ORIGIN !== "https://ewatrade.com")
    failures.push("Mobile must use the published production legal origin.")
  for (const key of Object.keys(mobile)) {
    if (
      /WHATSAPP_OTP|BETTER_AUTH_SECRET|AUTH_SECRET|ACCOUNT_PRIVACY_OTP_SECRET/.test(
        key,
      )
    )
      failures.push(
        `Server-only configuration must not appear in mobile: ${key}.`,
      )
  }
  for (const key of Object.keys(server)) {
    if (
      key.startsWith("EXPO_PUBLIC_") &&
      /WHATSAPP_OTP|AUTH_SECRET|ACCOUNT_PRIVACY_OTP_SECRET/.test(key)
    )
      failures.push(
        `Server-only configuration must not use a public prefix: ${key}.`,
      )
  }
  if (server.WHATSAPP_OTP_ACCESS_TOKEN?.trim()) {
    try {
      // Validate the dormant configuration without constructing a sender.
      readWhatsAppOtpConfig({ ...server, WHATSAPP_OTP_ENABLED: "true" })
    } catch {
      failures.push("Dormant sender configuration is invalid.")
    }
    pending.push(
      "Confirm production token permissions, expiry and renewal owner.",
    )
  } else {
    pending.push(
      "Install a reviewed production token before future activation.",
    )
  }
  pending.push(
    "Verify hosted environment and deployed revision separately from local files.",
    "Verify production schema compatibility through the approved release workflow.",
    "Confirm sender display-name readiness and payment with Meta.",
    "Complete authorized received-code signup/sign-in before enabling real users.",
    "Complete iOS/production-build acceptance and publish the updated client.",
  )
  return { failures, pending, apiOrigin: api.origin }
}

export async function probeDisabledPhoneAuth(
  origin: string,
  fetchImpl: typeof fetch = fetch,
) {
  try {
    const response = await fetchImpl(
      `${origin}/api/trpc/auth.phoneOtpAvailability`,
      {
        redirect: "manual",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      return [
        "Hosted phone availability is missing or did not return JSON 200.",
      ]
    const body = await response.json()
    if (body?.result?.data?.json?.enabled !== false)
      return ["Hosted phone authentication was not confirmed disabled."]
    return []
  } catch {
    return ["Hosted phone availability could not be checked."]
  }
}

if (import.meta.main) {
  if (process.argv.slice(2).some((arg) => arg !== "--live-read-only"))
    throw new Error(
      "Supported option: --live-read-only (GET availability only).",
    )
  // Read the selected production files only; never inherit local/dev secrets.
  const root = resolve(import.meta.dir, "..")
  const result = phoneAuthReleaseReadiness(
    {
      ...readEnvironmentFile(resolve(root, ".env.production")),
      APP_ENV: "production",
      DEV_PROFILE: "prod",
      NODE_ENV: "production",
    },
    readEnvironmentFile(resolve(root, "apps/mobile/.env.production")),
  )
  if (process.argv.includes("--live-read-only") && result.apiOrigin)
    result.failures.push(...(await probeDisabledPhoneAuth(result.apiOrigin)))
  console.log(
    JSON.stringify(
      {
        mode: "disabled-preparation",
        configured: result.failures.length === 0,
        activationAccepted: false,
        ...result,
      },
      null,
      2,
    ),
  )
  if (result.failures.length) process.exitCode = 1
}
