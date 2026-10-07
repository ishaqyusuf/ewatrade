/**
 * Vercel team shared variables carry an `EWATRADE_` prefix so one value can be
 * linked to every EwaTrade project without colliding with other products. Code
 * and local env files keep the plain names; each process maps the prefixed
 * value onto the plain name once at start-up, and a plain value always wins.
 */
export const EWATRADE_SHARED_ENV_PREFIX = "EWATRADE_"

export const EWATRADE_SHARED_ENV_NAMES = [
  "BETTER_AUTH_SECRET",
  "ACCOUNT_PRIVACY_OTP_SECRET",
  "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "MARKETING_INBOX_EMAILS",
  // URLs and domains
  "API_URL",
  "STOREFRONT_URL",
  "PLATFORM_DOMAIN",
  "ALLOWED_API_ORIGINS",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  // Integrations, logging, app identity and flags
  "VERCEL_STOREFRONT_PROJECT_ID",
  "VERCEL_API_TOKEN",
  "LOGLY_PROJECT_KEY",
  "LOGLY_MOBILE_PROJECT_KEY",
  "LOGLY_COLLECTOR_URL",
  "APPLE_CLIENT_IDS",
  "EARLY_ACCESS_LINK_TTL_DAYS",
  "QA_ACCELERATOR_ENABLED",
  // Browser-visible values: next.config maps them before Next inlines them.
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "NEXT_PUBLIC_MARKETING_URL",
  "NEXT_PUBLIC_PLATFORM_DOMAIN",
  "NEXT_PUBLIC_LOGLY_ENABLED",
  "NEXT_PUBLIC_LOGLY_PROJECT",
  "NEXT_PUBLIC_SIGNUP_ENABLED",
  "NEXT_PUBLIC_STOREFRONT_URL",
] as const

/** Returns the names it filled, for start-up diagnostics (never values). */
export function applyEwatradeSharedEnv(
  env: Record<string, string | undefined> = process.env,
) {
  const filled: string[] = []
  for (const name of EWATRADE_SHARED_ENV_NAMES) {
    if (env[name]?.trim()) continue
    const shared = env[`${EWATRADE_SHARED_ENV_PREFIX}${name}`]?.trim()
    if (!shared) continue
    env[name] = shared
    filled.push(name)
  }
  return filled
}
