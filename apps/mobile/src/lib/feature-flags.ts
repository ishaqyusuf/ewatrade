import Constants from "expo-constants"
import { getAppVariant } from "./app-variant"

export const DEV_SKIP_OTP_CODE = "123456"

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

function isTruthyFlag(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value !== "string") return false

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
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

export function isSkipOtpEnabled() {
  const extra = Constants.expoConfig?.extra as
    | { skipOtp?: boolean | number | string }
    | undefined

  return isTruthyFlag(
    extra?.skipOtp ?? process.env.EXPO_PUBLIC_SKIP_OTP ?? process.env.SKIP_OTP,
  )
}
