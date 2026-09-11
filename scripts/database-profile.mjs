import { BlockList, isIP } from "node:net"
import path from "node:path"
import { readEnvironmentFile } from "./environment-profile.mjs"

const localDatabaseAddresses = new BlockList()
localDatabaseAddresses.addSubnet("127.0.0.0", 8, "ipv4")
localDatabaseAddresses.addAddress("0.0.0.0", "ipv4")
localDatabaseAddresses.addAddress("::", "ipv6")
localDatabaseAddresses.addAddress("::1", "ipv6")
localDatabaseAddresses.addSubnet("::ffff:7f00:0", 104, "ipv6")

const localDatabaseHostnames = new Set([
  "docker.for.mac.localhost",
  "ewatrade-postgres",
  "host.docker.internal",
  "postgres",
])

export function databaseProfileForEnv(env) {
  const selectedProfile = env.DEV_PROFILE ?? env.APP_ENV

  if (selectedProfile === "prod" || selectedProfile === "production") {
    return "prod"
  }

  if (selectedProfile === "preview") {
    return "preview"
  }

  if (selectedProfile === "dev" || selectedProfile === "development") {
    return "dev"
  }

  if (selectedProfile === "local") {
    return "local"
  }

  if (env.NODE_ENV === "production") {
    return "prod"
  }

  return "local"
}

export function directDatabaseUrlForPrismaCli(databaseUrl) {
  const url = new URL(databaseUrl)
  // Prisma's Rust schema engine does not support libpq's channel_binding URL
  // option. Runtime clients keep the original URL; CLI migrations retain TLS
  // while removing only the unsupported driver-specific option.
  url.searchParams.delete("channel_binding")
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!hostname.endsWith(".neon.tech")) return url.toString()
  const labels = hostname.split(".")
  const endpoint = labels[0]
  if (!endpoint?.endsWith("-pooler")) return url.toString()
  labels[0] = endpoint.slice(0, -"-pooler".length)
  url.hostname = labels.join(".")
  return url.toString()
}

export function applyDatabaseProfile(env, productionDatabaseUrl) {
  const profile = databaseProfileForEnv(env)
  const databaseUrl = env.EWATRADE_DATABASE_URL?.trim()

  if (!databaseUrl) {
    throw new Error(
      `Missing EWATRADE_DATABASE_URL for ${profile}. Set it in the selected environment file.`,
    )
  }

  assertValidDatabaseUrl(databaseUrl, profile)

  if (profile === "local") {
    assertNeonDevelopmentDatabaseUrl(databaseUrl)
  }

  if (profile !== "prod") {
    assertNotLoopbackDatabaseUrl(databaseUrl, profile)
  }

  if (profile !== "prod") {
    const productionUrl = productionDatabaseUrl?.trim()

    if (!productionUrl) {
      throw new Error(
        `The production EWATRADE_DATABASE_URL is required to verify the ${profile} database target.`,
      )
    }

    assertValidDatabaseUrl(productionUrl, "production")

    if (databaseTargetsEqual(databaseUrl, productionUrl)) {
      throw new Error(
        `${profile} mode refuses the production database. Select the production profile explicitly for production access.`,
      )
    }
  }

  env.DATABASE_URL = undefined
  env.EWATRADE_DATABASE_URL = databaseUrl
  env.DEV_PROFILE = profile === "prod" ? (env.DEV_PROFILE ?? "prod") : profile

  return env
}

export function loadProductionDatabaseUrl(repoRoot) {
  const productionEnv = readEnvironmentFile(
    path.join(repoRoot, ".env.production"),
  )
  return productionEnv.EWATRADE_DATABASE_URL?.trim()
}

function assertValidDatabaseUrl(value, profile) {
  try {
    new URL(value)
  } catch {
    throw new Error(`Invalid EWATRADE_DATABASE_URL for ${profile}.`)
  }
}

function assertNeonDevelopmentDatabaseUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, "")

  if (!hostname.endsWith(".neon.tech")) {
    throw new Error(
      "local mode requires the Neon development EWATRADE_DATABASE_URL from .env.local; Docker and loopback PostgreSQL are not allowed.",
    )
  }
}

function assertNotLoopbackDatabaseUrl(value, profile) {
  const hostname = normalizeDatabaseHost(new URL(value).hostname)

  if (isLocalDatabaseHost(hostname)) {
    throw new Error(
      `${profile} mode refuses local Docker or loopback PostgreSQL. Use the configured hosted database profile.`,
    )
  }
}

function normalizeDatabaseHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  return normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized
}

function isLocalDatabaseHost(hostname) {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".docker.internal") ||
    localDatabaseHostnames.has(hostname)
  ) {
    return true
  }

  if (/^127(?:\.|$)/.test(hostname)) return true

  const family = isIP(hostname)
  return family === 4
    ? localDatabaseAddresses.check(hostname, "ipv4")
    : family === 6
      ? localDatabaseAddresses.check(hostname, "ipv6")
      : false
}

function databaseTargetsEqual(left, right) {
  const leftUrl = new URL(left)
  const rightUrl = new URL(right)
  const leftSupabaseProject = supabaseProjectRef(leftUrl)
  const rightSupabaseProject = supabaseProjectRef(rightUrl)

  if (leftSupabaseProject || rightSupabaseProject) {
    return (
      Boolean(leftSupabaseProject) &&
      leftSupabaseProject === rightSupabaseProject &&
      normalizedDatabaseProtocol(leftUrl.protocol) ===
        normalizedDatabaseProtocol(rightUrl.protocol) &&
      normalizedDatabasePath(leftUrl.pathname) ===
        normalizedDatabasePath(rightUrl.pathname)
    )
  }

  const sameEndpoint =
    normalizedDatabaseProtocol(leftUrl.protocol) ===
      normalizedDatabaseProtocol(rightUrl.protocol) &&
    normalizedDatabaseHostname(leftUrl.hostname) ===
      normalizedDatabaseHostname(rightUrl.hostname) &&
    effectivePort(leftUrl) === effectivePort(rightUrl) &&
    normalizedDatabasePath(leftUrl.pathname) ===
      normalizedDatabasePath(rightUrl.pathname)

  if (!sameEndpoint) {
    return false
  }

  const credentialScopedProvider = databaseUsernameIdentifiesTarget(
    leftUrl.hostname,
  )
  const distinctTargetUsernames =
    credentialScopedProvider &&
    Boolean(leftUrl.username) &&
    Boolean(rightUrl.username) &&
    decodeUrlComponent(leftUrl.username) !==
      decodeUrlComponent(rightUrl.username)

  return !distinctTargetUsernames
}

function normalizedDatabaseProtocol(protocol) {
  return protocol === "postgres:" || protocol === "postgresql:"
    ? "postgresql:"
    : protocol
}

function normalizedDatabaseHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")

  if (normalized.endsWith(".neon.tech")) {
    const labels = normalized.split(".")
    const endpoint = labels[0]

    if (endpoint?.endsWith("-pooler")) {
      labels[0] = endpoint.slice(0, -"-pooler".length)
      return labels.join(".")
    }
  }

  return normalized
}

function normalizedDatabasePath(pathname) {
  try {
    const normalized = decodeURIComponent(pathname)
    return normalized === "/" ? "" : normalized
  } catch {
    return pathname === "/" ? "" : pathname
  }
}

function supabaseProjectRef(url) {
  const hostname = normalizedDatabaseHostname(url.hostname)
  const directMatch = hostname.match(/^db\.([^.]+)\.supabase\.co$/)

  if (directMatch?.[1]) {
    return decodeUrlComponent(directMatch[1]).toLowerCase()
  }

  if (
    hostname === "pooler.supabase.com" ||
    hostname.endsWith(".pooler.supabase.com")
  ) {
    const username = decodeUrlComponent(url.username)
    const separatorIndex = username.lastIndexOf(".")

    if (separatorIndex >= 0 && separatorIndex < username.length - 1) {
      return username.slice(separatorIndex + 1).toLowerCase()
    }
  }

  return undefined
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function databaseUsernameIdentifiesTarget(hostname) {
  const normalized = normalizedDatabaseHostname(hostname)

  return (
    normalized === "psdb.cloud" ||
    normalized.endsWith(".psdb.cloud") ||
    normalized === "pooler.supabase.com" ||
    normalized.endsWith(".pooler.supabase.com")
  )
}

function effectivePort(url) {
  if (url.port) {
    return url.port
  }

  if (url.protocol === "postgresql:" || url.protocol === "postgres:") {
    return "5432"
  }

  return ""
}
