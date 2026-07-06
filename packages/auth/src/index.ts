import type { Membership, User } from "@ewatrade/db"
import {
  extractTenantSlugFromPlatformHostname,
  inferTenantSurfaceFromHostname,
  normalizeHostname,
} from "@ewatrade/utils"
export * from "./roles"

export type SessionScope = typeof platformSessionScope | string

export type AuthSession = {
  scope: SessionScope
  token: string
  user: User
}

export type SignedSessionPayload = {
  expiresAt: number
  nonce: string
  scope: SessionScope
  userId: string
}

export type AuthContext = {
  activeMembership: Membership | null
  session: AuthSession | null
}

export const authSessionCookieName = "ewatrade_session"
export const authUserCookieName = "ewatrade_user"
export const platformSessionScope = "platform"
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7

export function getScopedAuthSessionCookieName(scope: SessionScope) {
  return scope === platformSessionScope
    ? authSessionCookieName
    : `${authSessionCookieName}_${scope}`
}

export function getScopedAuthUserCookieName(scope: SessionScope) {
  return scope === platformSessionScope
    ? authUserCookieName
    : `${authUserCookieName}_${scope}`
}

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  if (!cookieHeader) {
    return new Map<string, string>()
  }

  return new Map(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=")
        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)]
      })
  )
}

function getSessionSecret() {
  const secret = process.env.EWATRADE_AUTH_SECRET

  if (secret?.trim()) {
    return secret.trim()
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("EWATRADE_AUTH_SECRET is required in production.")
  }

  return "ewatrade-dev-session-secret"
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

async function signValue(value: string) {
  const { createHmac, timingSafeEqual } = await import("node:crypto")
  const signature = createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url")

  return {
    signature,
    verify(candidate: string) {
      const expected = Buffer.from(signature)
      const actual = Buffer.from(candidate)

      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      )
    },
  }
}

export async function createSignedSessionToken(input: {
  scope: SessionScope
  userId: string
}) {
  const payload = {
    expiresAt: Date.now() + sessionTtlMs,
    nonce: crypto.randomUUID(),
    scope: input.scope,
    userId: input.userId,
  } satisfies SignedSessionPayload
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const { signature } = await signValue(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export async function verifySignedSessionToken(input: {
  expectedScope?: SessionScope | null
  token: string | null | undefined
}) {
  if (!input.token) {
    return null
  }

  const [encodedPayload, signature] = input.token.split(".")

  if (!encodedPayload || !signature) {
    return null
  }

  const verifier = await signValue(encodedPayload)

  if (!verifier.verify(signature)) {
    return null
  }

  try {
    const payload = JSON.parse(
      decodeBase64Url(encodedPayload)
    ) as Partial<SignedSessionPayload>

    if (
      !payload.userId ||
      !payload.scope ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null
    }

    if (input.expectedScope && payload.scope !== input.expectedScope) {
      return null
    }

    return payload as SignedSessionPayload
  } catch {
    return null
  }
}

export function resolveRequestSessionScope(host: string | null | undefined) {
  const platformDomain =
    process.env.EWATRADE_PLATFORM_DOMAIN ??
    process.env.NEXT_PUBLIC_EWATRADE_PLATFORM_DOMAIN ??
    "ewatrade.localhost"
  const hostname = normalizeHostname(host)

  if (!hostname) {
    return platformSessionScope
  }

  const surface = inferTenantSurfaceFromHostname(hostname, platformDomain)

  if (surface === "dashboard" || surface === "pos" || surface === "storefront") {
    return (
      extractTenantSlugFromPlatformHostname(hostname, platformDomain) ??
      hostname
    )
  }

  return platformSessionScope
}

export function getSessionTokenFromCookieHeader(input: {
  cookieHeader?: string | null
  host?: string | null
  explicitScope?: SessionScope | null
}) {
  const cookies = parseCookieHeader(input.cookieHeader)
  const scope = input.explicitScope ?? resolveRequestSessionScope(input.host)
  const scopedCookieName = getScopedAuthSessionCookieName(scope)

  return (
    cookies.get(scopedCookieName) ?? cookies.get(authSessionCookieName) ?? null
  )
}

export function getUserIdFromCookieHeader(input: {
  cookieHeader?: string | null
  host?: string | null
  explicitScope?: SessionScope | null
}) {
  const cookies = parseCookieHeader(input.cookieHeader)
  const scope = input.explicitScope ?? resolveRequestSessionScope(input.host)
  const scopedCookieName = getScopedAuthUserCookieName(scope)

  return (
    cookies.get(scopedCookieName) ?? cookies.get(authUserCookieName) ?? null
  )
}

export function hasActiveMembership(auth: AuthContext): auth is AuthContext & {
  activeMembership: Membership
  session: AuthSession
} {
  return Boolean(auth.session && auth.activeMembership)
}
