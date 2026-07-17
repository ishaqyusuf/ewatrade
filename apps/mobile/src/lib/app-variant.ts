import Constants from "expo-constants"

const INTERNAL_TOOL_VARIANTS = new Set(["dev", "development", "preview"])

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

export function shouldShowFloatingThemeToggle() {
  return new Set(["dev", "development"]).has(getAppVariant())
}

export function shouldShowInternalDesignSystemEntry() {
  return INTERNAL_TOOL_VARIANTS.has(getAppVariant())
}
