function resolveAppVariant(env) {
  const explicit = env.APP_VARIANT ?? env.EXPO_PUBLIC_APP_VARIANT
  if (explicit) return explicit.toLowerCase()
  const profile = env.EAS_BUILD_PROFILE ?? env.DEV_PROFILE ?? env.APP_ENV
  if (["development", "dev", "local"].includes(profile)) return "development"
  if (profile === "preview") return "preview"
  return "production"
}
module.exports = { resolveAppVariant }
