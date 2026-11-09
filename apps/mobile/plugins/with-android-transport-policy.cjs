const { withAndroidManifest } = require("expo/config-plugins")

function applyTransportPolicy(manifest, allowDevelopmentCleartext = false) {
  const application = manifest.manifest.application?.[0]
  if (!application) throw new Error("Android application manifest is missing")
  application.$ ??= {}
  // A network-security XML overrides this attribute on our supported Android
  // versions. Require an explicit review instead of silently weakening release.
  if (
    !allowDevelopmentCleartext &&
    application.$["android:networkSecurityConfig"]
  ) {
    throw new Error("Review Android networkSecurityConfig before release")
  }
  application.$["android:usesCleartextTraffic"] = allowDevelopmentCleartext
    ? "true"
    : "false"
  return manifest
}

module.exports = (config, { allowDevelopmentCleartext = false } = {}) =>
  withAndroidManifest(config, (result) => {
    result.modResults = applyTransportPolicy(
      result.modResults,
      allowDevelopmentCleartext === true,
    )
    return result
  })
module.exports.applyTransportPolicy = applyTransportPolicy
