/** Analytics must never inherit the general app variant's Production fallback. */
function resolveMobileAnalyticsEnvironment(env) {
  if (env.IOS_TESTFLIGHT === "1") return "disabled"
  const signals = [
    [env.APP_ENV, ["production"]],
    [env.DEV_PROFILE, ["prod", "production"]],
    [env.APP_VARIANT, ["production"]],
    [env.EXPO_PUBLIC_APP_VARIANT, ["production"]],
    [env.EAS_BUILD_PROFILE, ["production", "production-apk"]],
  ]
  let explicit = false
  for (const [value, productionValues] of signals) {
    if (value === undefined) continue
    explicit = true
    if (!productionValues.includes(value)) return "disabled"
  }
  return explicit ? "production" : "disabled"
}

module.exports = { resolveMobileAnalyticsEnvironment }
