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
