// Signed lifecycle links (plan §4.2): click tracking `/go/:token` and the
// no-login email-preference / one-click unsubscribe token.
//
// HMAC-SHA256 over a purpose-scoped body with `LIFECYCLE_LINK_SECRET`. Tokens
// carry ids only, never email addresses or business data.

import { createHmac, timingSafeEqual } from "node:crypto"

export type LifecycleClickToken = {
  /** LifecycleMessage id. */
  m: string
  /** App-relative CTA path (validated by `safeCtaPath`). */
  p: string
}

export type LifecyclePreferenceToken = {
  /** User id. */
  u: string
}

type Purpose = "go" | "prefs"

const MIN_SECRET_LENGTH = 32

export function lifecycleLinkSecret(env: { LIFECYCLE_LINK_SECRET?: string }) {
  const secret = env.LIFECYCLE_LINK_SECRET?.trim()
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

function signature(purpose: Purpose, body: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`lifecycle:${purpose}:${body}`)
    .digest("base64url")
}

function sign(purpose: Purpose, payload: object, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${signature(purpose, body, secret)}`
}

function verify(purpose: Purpose, token: string, secret: string) {
  const [body, mac, extra] = token.split(".")
  if (!body || !mac || extra !== undefined || token.length > 2048) return null
  const expected = Buffer.from(signature(purpose, body, secret))
  const received = Buffer.from(mac)
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return null
  try {
    return JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as unknown
  } catch {
    return null
  }
}

/**
 * Only same-app paths: one leading slash, no scheme, host or backslash, so the
 * redirect can never leave the Dashboard origin.
 */
export function safeCtaPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 512) return null
  if (!path.startsWith("/") || path.startsWith("//")) return null
  if (/[\\\s]/.test(path) || /^\/[a-z][a-z0-9+.-]*:/i.test(path)) return null
  return path
}

export function signLifecycleClickToken(
  payload: LifecycleClickToken,
  secret: string,
) {
  const path = safeCtaPath(payload.p)
  if (!path) throw new Error("Lifecycle CTA must be an app-relative path.")
  return sign("go", { m: payload.m, p: path }, secret)
}

export function verifyLifecycleClickToken(
  token: string,
  secret: string,
): LifecycleClickToken | null {
  const value = verify("go", token, secret) as Partial<LifecycleClickToken>
  if (!value || typeof value.m !== "string" || !value.m) return null
  const path = safeCtaPath(value.p)
  return path ? { m: value.m, p: path } : null
}

export function signLifecyclePreferenceToken(userId: string, secret: string) {
  return sign("prefs", { u: userId }, secret)
}

export function verifyLifecyclePreferenceToken(
  token: string,
  secret: string,
): LifecyclePreferenceToken | null {
  const value = verify(
    "prefs",
    token,
    secret,
  ) as Partial<LifecyclePreferenceToken> | null
  return value && typeof value.u === "string" && value.u ? { u: value.u } : null
}

/** Dashboard URL for the CTA with lifecycle UTM parameters. */
export function lifecycleRedirectUrl(
  dashboardOrigin: string,
  path: string,
  playId: string,
) {
  const url = new URL(path, dashboardOrigin)
  if (url.origin !== new URL(dashboardOrigin).origin)
    throw new Error("Lifecycle redirect left the Dashboard origin.")
  url.searchParams.set("utm_source", "lifecycle")
  url.searchParams.set("utm_medium", "email")
  url.searchParams.set("utm_campaign", playId)
  return url
}

/** The URLs one lifecycle email needs. Origins have no trailing slash. */
export function lifecycleEmailLinks(input: {
  apiOrigin: string
  dashboardOrigin: string
  secret: string
  messageId: string
  userId: string
  ctaPath: string
}) {
  const click = signLifecycleClickToken(
    { m: input.messageId, p: input.ctaPath },
    input.secret,
  )
  const prefs = signLifecyclePreferenceToken(input.userId, input.secret)
  const preferencesUrl = new URL("/email-preferences", input.dashboardOrigin)
  preferencesUrl.searchParams.set("token", prefs)
  const unsubscribeUrl = new URL(preferencesUrl)
  unsubscribeUrl.searchParams.set("unsubscribe", "1")
  const oneClickUrl = new URL("/lifecycle/unsubscribe", input.apiOrigin)
  oneClickUrl.searchParams.set("token", prefs)
  return {
    ctaHref: new URL(`/go/${click}`, input.apiOrigin).href,
    preferencesUrl: preferencesUrl.href,
    unsubscribeUrl: unsubscribeUrl.href,
    oneClickUnsubscribeUrl: oneClickUrl.href,
  }
}
