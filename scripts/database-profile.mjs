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

  if (
    env.APP_ENV === "remote-dev" ||
    env.DEV_PROFILE === "remote-dev"
  ) {
    return "remote-dev"
  }

  return "local"
}

export function applyDatabaseProfile(env) {
  const profile = databaseProfileForEnv(env)
  const databaseUrl = resolveDatabaseUrl(env, profile)

  if (databaseUrl) {
    env.DATABASE_URL = databaseUrl

    if (!env.POSTGRES_URL) {
      env.POSTGRES_URL = databaseUrl
    }

    if (profile === "local" && !env.LOCAL_DATABASE_URL) {
      env.LOCAL_DATABASE_URL = databaseUrl
    }

    if (profile === "remote-dev" && !env.REMOTE_DEV_DATABASE_URL) {
      env.REMOTE_DEV_DATABASE_URL = databaseUrl
    }

    if (profile === "prod" && !env.PROD_DATABASE_URL) {
      env.PROD_DATABASE_URL = databaseUrl
    }
  }

  env.DEV_PROFILE = profile === "prod" ? (env.DEV_PROFILE ?? "prod") : profile

  return env
}

function resolveDatabaseUrl(env, profile) {
  switch (profile) {
    case "local":
      return (
        firstEnvValue(env, ["LOCAL_DATABASE_URL", "LOCAL_POSTGRES_URL"]) ??
        localEnvValue(env, "DATABASE_URL") ??
        localEnvValue(env, "POSTGRES_URL") ??
        defaultLocalDatabaseUrl(env)
      )
    case "remote-dev":
      return (
        firstEnvValue(env, [
          "REMOTE_DEV_DATABASE_URL",
          "DEV_DATABASE_URL",
          "REMOTE_DEV_POSTGRES_URL",
          "DEV_POSTGRES_URL",
        ]) ??
        nonLocalEnvValue(env, "DATABASE_URL") ??
        nonLocalEnvValue(env, "POSTGRES_URL")
      )
    case "prod":
      return (
        firstEnvValue(env, ["PROD_DATABASE_URL", "PROD_POSTGRES_URL"]) ??
        env.DATABASE_URL ??
        env.POSTGRES_URL
      )
  }
}

function defaultLocalDatabaseUrl(env) {
  const host = env.DB_HOST ?? "localhost"
  const port = env.DB_HOST_PORT ?? "55436"
  const database = env.DB_NAME ?? "ewatrade"
  const user = env.DB_USER ?? "postgres"
  const password = env.DB_PASSWORD ?? "postgres"

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password
  )}@${host}:${port}/${database}`
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]

    if (value) {
      return value
    }
  }

  return undefined
}

function localEnvValue(env, key) {
  const value = env[key]
  return value && isLocalDatabaseUrl(value) ? value : undefined
}

function nonLocalEnvValue(env, key) {
  const value = env[key]
  return value && !isLocalDatabaseUrl(value) ? value : undefined
}

function isLocalDatabaseUrl(value) {
  try {
    return localDatabaseHosts.has(new URL(value).hostname)
  } catch {
    return false
  }
}
