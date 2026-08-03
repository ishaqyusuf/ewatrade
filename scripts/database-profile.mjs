import path from "node:path"
import { readEnvironmentFile } from "./environment-profile.mjs"

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

export function applyDatabaseProfile(env, productionDatabaseUrl) {
  const profile = databaseProfileForEnv(env)
  const databaseUrl = env.DATABASE_URL?.trim()

  if (!databaseUrl) {
    throw new Error(
      `Missing DATABASE_URL for ${profile}. Set it in the selected environment file.`,
    )
  }

  assertValidDatabaseUrl(databaseUrl, profile)

  if (profile !== "prod") {
    const productionUrl = productionDatabaseUrl?.trim()

    if (!productionUrl) {
      throw new Error(
        `The production DATABASE_URL is required to verify the ${profile} database target.`,
      )
    }

    assertValidDatabaseUrl(productionUrl, "production")

    if (databaseTargetsEqual(databaseUrl, productionUrl)) {
      throw new Error(
        `${profile} mode refuses the production database. Select the production profile explicitly for production access.`,
      )
    }
  }

  env.DATABASE_URL = databaseUrl
  env.DEV_PROFILE = profile === "prod" ? (env.DEV_PROFILE ?? "prod") : profile

  return env
}

export function loadProductionDatabaseUrl(repoRoot) {
  const productionEnv = readEnvironmentFile(
    path.join(repoRoot, ".env.production"),
  )
  return productionEnv.DATABASE_URL?.trim()
}

function assertValidDatabaseUrl(value, profile) {
  try {
    new URL(value)
  } catch {
    throw new Error(`Invalid DATABASE_URL for ${profile}.`)
  }
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
