const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins")
const appSchemes = new Set(["ewatrade", "ewatrade-preview", "ewatrade-dev"])
function allowedScheme(scheme, selected) {
  return !appSchemes.has(scheme) || scheme === selected
}
function filterAndroidSchemes(manifest, selected) {
  for (const application of manifest.application ?? []) {
    for (const activity of application.activity ?? []) {
      const filters = activity["intent-filter"] ?? []
      activity["intent-filter"] = filters.filter((filter) => {
        if (!filter.data) return true
        const before = filter.data.length
        filter.data = filter.data.filter((data) =>
          allowedScheme(data.$?.["android:scheme"], selected),
        )
        return before === 0 || filter.data.length > 0
      })
    }
  }
  return manifest
}
function filterIosSchemes(plist, selected) {
  if (!plist.CFBundleURLTypes) return plist
  plist.CFBundleURLTypes = plist.CFBundleURLTypes.filter((entry) => {
    if (!entry.CFBundleURLSchemes) return true
    const before = entry.CFBundleURLSchemes.length
    entry.CFBundleURLSchemes = entry.CFBundleURLSchemes.filter((scheme) =>
      allowedScheme(scheme, selected),
    )
    return before === 0 || entry.CFBundleURLSchemes.length > 0
  })
  return plist
}
function withVariantLinkSchemes(config) {
  const selected = config.scheme
  if (!appSchemes.has(selected))
    throw new Error("Configure one EwaTrade variant scheme before prebuild.")
  const androidConfig = withAndroidManifest(config, (result) => {
    filterAndroidSchemes(result.modResults.manifest, selected)
    return result
  })
  return withInfoPlist(androidConfig, (result) => {
    filterIosSchemes(result.modResults, selected)
    return result
  })
}
module.exports = withVariantLinkSchemes
module.exports.filterAndroidSchemes = filterAndroidSchemes
module.exports.filterIosSchemes = filterIosSchemes
