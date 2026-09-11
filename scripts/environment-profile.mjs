import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

export const ENVIRONMENT_FILE_BY_PROFILE = Object.freeze({
  local: ".env.local",
  dev: ".env.dev",
  preview: ".env.preview",
  production: ".env.production",
})

export function environmentProfileForEnv(env = process.env) {
  const requestedProfile = env.DEV_PROFILE ?? env.APP_ENV

  if (requestedProfile) {
    return normalizeEnvironmentProfile(requestedProfile)
  }

  return env.NODE_ENV === "production" ? "production" : "local"
}

export function envFileForProfile(profile) {
  return ENVIRONMENT_FILE_BY_PROFILE[normalizeEnvironmentProfile(profile)]
}

export function readEnvironmentFile(filePath) {
  if (!existsSync(filePath)) {
    return {}
  }

  return parseEnv(readFileSync(filePath, "utf8"))
}

export function loadRootEnvironment(repoRoot, envSeed = process.env) {
  const profile = environmentProfileForEnv(envSeed)
  const profileFile = envFileForProfile(profile)
  const baseEnv = readEnvironmentFile(path.join(repoRoot, ".env"))
  const profilePath = path.join(repoRoot, profileFile)
  const profileExists = existsSync(profilePath)
  const profileEnv = readEnvironmentFile(profilePath)

  return {
    env: {
      ...envSeed,
      ...baseEnv,
      ...profileEnv,
      APP_ENV: profile,
      DATABASE_URL: undefined,
      EWATRADE_DATABASE_URL:
        profileEnv.EWATRADE_DATABASE_URL ??
        (profileExists ? undefined : envSeed.EWATRADE_DATABASE_URL),
      DEV_PROFILE: profile,
    },
    profile,
    profileEnv,
    profileExists,
    profileFile,
  }
}

function normalizeEnvironmentProfile(profile) {
  if (profile === "local") {
    return "local"
  }

  if (profile === "dev" || profile === "development") {
    return "dev"
  }

  if (profile === "preview") {
    return "preview"
  }

  if (profile === "prod" || profile === "production") {
    return "production"
  }

  throw new Error(
    `Unknown environment profile "${profile}". Use local, dev, preview, or production.`,
  )
}
