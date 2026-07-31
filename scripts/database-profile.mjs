const localDatabaseHosts = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "postgres",
])

export function databaseProfileForEnv(env) {
  if (env.NODE_ENV === "production" || env.APP_ENV === "production") {
    return "prod"
  }

  if (env.APP_ENV === "preview" || env.DEV_PROFILE === "preview") {
    return "preview"
  }

  return "local"
}

export function applyDatabaseProfile(env) {
  const profile = databaseProfileForEnv(env)
  const databaseUrl = env.DATABASE_URL?.trim()

  if (!databaseUrl) {
    throw new Error(
      `Missing DATABASE_URL for ${profile}. Set it in the selected environment file.`,
    )
  }

  const isLocal = isLocalDatabaseUrl(databaseUrl)

  if (profile === "local" && !isLocal) {
    throw new Error("Local mode requires a local DATABASE_URL from .env.local.")
  }

  if (profile !== "local" && isLocal) {
    throw new Error(
      `${profile} mode refuses a local DATABASE_URL. Check the selected environment file.`,
    )
  }

  env.DATABASE_URL = databaseUrl
  env.DEV_PROFILE = profile === "prod" ? (env.DEV_PROFILE ?? "prod") : profile

  return env
}

function isLocalDatabaseUrl(value) {
  try {
    return localDatabaseHosts.has(new URL(value).hostname)
  } catch {
    return false
  }
}
