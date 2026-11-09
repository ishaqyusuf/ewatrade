// Shared by Expo config and the offline release preflight. No credentials here.
const PLAY_PREVIEW_PROFILE = "play-preview"
const PLAY_PREVIEW_ORIGINS = Object.freeze({
  EXPO_PUBLIC_API_URL: "https://preview-api.ewatrade.com",
  EXPO_PUBLIC_DASHBOARD_URL: "https://preview-dashboard.ewatrade.com",
  EXPO_PUBLIC_BASE_URL: "https://preview-dashboard.ewatrade.com",
  EXPO_PUBLIC_WEB_URL: "https://preview-dashboard.ewatrade.com",
  EXPO_PUBLIC_CHAT_URL: "https://preview-storefront.ewatrade.com",
  EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "preview-storefront.ewatrade.com",
  EXPO_PUBLIC_LEGAL_ORIGIN: "https://ewatrade.com",
  EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND: "false",
})

function isPlayPreviewBuild(env) {
  const optedIn = env.ANDROID_PLAY_TEST === "1"
  const selected = env.EAS_BUILD_PROFILE === PLAY_PREVIEW_PROFILE
  if (!optedIn && !selected) return false
  if (
    !optedIn ||
    !selected ||
    env.IOS_TESTFLIGHT === "1" ||
    env.APP_VARIANT !== "preview" ||
    env.EXPO_PUBLIC_APP_VARIANT !== "preview" ||
    env.APP_ENV !== "preview" ||
    env.DEV_PROFILE !== "preview" ||
    (env.EAS_BUILD_PLATFORM && env.EAS_BUILD_PLATFORM !== "android") ||
    Object.entries(PLAY_PREVIEW_ORIGINS).some(
      ([key, value]) => env[key] !== value,
    )
  )
    throw new Error(
      "Play testing requires its explicit Android Preview profile and isolated service origins.",
    )
  return true
}
module.exports = {
  PLAY_PREVIEW_PROFILE,
  PLAY_PREVIEW_ORIGINS,
  isPlayPreviewBuild,
}
