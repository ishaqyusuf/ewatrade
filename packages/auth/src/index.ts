import { prisma } from "@ewatrade/db"
import { normalizeHostname, stripPort } from "@ewatrade/utils"
import { compare } from "bcryptjs"
import type { BetterAuthOptions } from "better-auth"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { hashPassword, verifyPassword } from "better-auth/crypto"
import { nextCookies } from "better-auth/next-js"

export * from "./roles"

type InitAuthOptions = {
  baseUrl?: string
  productionUrl?: string
  secret?: string
}

function splitEnvList(value: string | null | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean))] as string[]
}

function getPlatformDomain() {
  return (
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ??
    process.env.PLATFORM_DOMAIN ??
    "ewatrade.com"
  )
}

function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET

  if (secret?.trim()) {
    return secret.trim()
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production.")
  }

  return "ewatrade-dev-better-auth-secret"
}

function getDefaultBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3095"
  )
}

function getDefaultProductionUrl(platformDomain = getPlatformDomain()) {
  return (
    process.env.BETTER_AUTH_PRODUCTION_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    `https://api.${stripPort(platformDomain)}`
  )
}

function getCookieDomain(platformDomain = getPlatformDomain()) {
  const hostname = stripPort(normalizeHostname(platformDomain))

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return null
  }

  return hostname.startsWith(".") ? hostname : `.${hostname}`
}

function toOrigin(value: string | null | undefined) {
  if (!value?.trim()) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    const hostname = normalizeHostname(value)
    if (!hostname) return null

    return `https://${hostname}`
  }
}

function getTrustedOrigins(input: {
  baseUrl: string
  productionUrl: string
  request?: Request
}) {
  const platformDomain = stripPort(getPlatformDomain())
  const requestOrigin = input.request?.headers.get("origin") ?? null
  const requestUrlOrigin = input.request?.url
    ? new URL(input.request.url).origin
    : null

  return uniq([
    "http://localhost:3092",
    "http://localhost:3094",
    "http://localhost:3095",
    "http://127.0.0.1:3092",
    "http://127.0.0.1:3094",
    "http://127.0.0.1:3095",
    toOrigin(input.baseUrl),
    toOrigin(input.productionUrl),
    toOrigin(platformDomain),
    process.env.NEXT_PUBLIC_MARKETING_URL,
    process.env.NEXT_PUBLIC_DASHBOARD_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.MARKETING_URL,
    process.env.DASHBOARD_URL,
    process.env.API_URL,
    requestUrlOrigin,
    requestOrigin,
    ...splitEnvList(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
    ...splitEnvList(process.env.ALLOWED_API_ORIGINS),
  ]).map((origin) => origin.replace(/\/$/, ""))
}

function isLegacyBcryptHash(hash: string) {
  return /^\$2[aby]\$/.test(hash)
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
      }),
  )
}

export function initAuth(options: InitAuthOptions = {}) {
  const platformDomain = getPlatformDomain()
  const baseUrl = options.baseUrl ?? getDefaultBaseUrl()
  const productionUrl =
    options.productionUrl ?? getDefaultProductionUrl(platformDomain)
  const cookieDomain = getCookieDomain(platformDomain)

  const config = {
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    baseURL: baseUrl,
    secret: options.secret ?? getAuthSecret(),
    user: {
      additionalFields: {
        firstName: {
          required: false,
          type: "string",
        },
        lastName: {
          required: false,
          type: "string",
        },
        displayName: {
          required: false,
          type: "string",
        },
        avatarUrl: {
          required: false,
          type: "string",
        },
        phone: {
          required: false,
          type: "string",
        },
        isPlatformAdmin: {
          defaultValue: false,
          required: false,
          type: "boolean",
        },
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "jwe",
      },
    },
    emailAndPassword: {
      enabled: true,
      password: {
        hash: hashPassword,
        async verify({ hash, password }) {
          if (isLegacyBcryptHash(hash)) {
            return compare(password, hash)
          }

          return verifyPassword({ hash, password })
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      ...(cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: cookieDomain,
            },
          }
        : {}),
    },
    plugins: [nextCookies()],
    trustedOrigins: (request) =>
      getTrustedOrigins({
        baseUrl,
        productionUrl,
        request,
      }),
  } satisfies BetterAuthOptions

  return betterAuth(config)
}

export const auth = initAuth()

export type Auth = ReturnType<typeof initAuth>
export type Session = Auth["$Infer"]["Session"]
