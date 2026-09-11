import Constants from "expo-constants"

const INTERNAL_TOOL_VARIANTS = new Set([
  "local",
  "dev",
  "development",
  "preview",
])
const DEVELOPMENT_APP_VARIANTS = new Set(["local", "dev", "development"])

export function getAppVariant() {
  return (
    Constants.expoConfig?.extra?.appVariant ??
    process.env.EXPO_PUBLIC_APP_VARIANT ??
    process.env.APP_VARIANT ??
    "production"
  )
    .toString()
    .toLowerCase()
}

export function isDevelopmentAppVariant() {
  return DEVELOPMENT_APP_VARIANTS.has(getAppVariant())
}

export function shouldShowFloatingThemeToggle() {
  return INTERNAL_TOOL_VARIANTS.has(getAppVariant())
}

export function shouldShowInternalDesignSystemEntry() {
  return INTERNAL_TOOL_VARIANTS.has(getAppVariant())
}
