import { getAppVariant } from "./app-variant"

export type FeatureFlagMode =
  | "dev"
  | "development"
  | "preview"
  | "production"
  | string

const MODE_ALIASES: Record<string, string[]> = {
  dev: ["dev", "development"],
  development: ["dev", "development"],
  prod: ["prod", "production"],
  production: ["prod", "production"],
}

function normalizeMode(mode: FeatureFlagMode) {
  return mode.toString().trim().toLowerCase()
}

function getModeMatches(mode: FeatureFlagMode) {
  const normalizedMode = normalizeMode(mode)
  return MODE_ALIASES[normalizedMode] ?? [normalizedMode]
}

export function shouldUseFeatureFallback(
  fallbackModes: FeatureFlagMode[] = ["dev"],
) {
  const activeMode = normalizeMode(getAppVariant())
  const allowedModes = fallbackModes.flatMap(getModeMatches)

  return allowedModes.includes(activeMode)
}

export function isDevLikeMode() {
  return shouldUseFeatureFallback(["dev", "preview"])
}
