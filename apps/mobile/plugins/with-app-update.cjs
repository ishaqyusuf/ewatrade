const { withAndroidManifest } = require("expo/config-plugins")

module.exports = (config) => withAndroidManifest(config, (result) => {
  const permission = "android.permission.REQUEST_INSTALL_PACKAGES"
  const existing = result.modResults.manifest["uses-permission"] ?? []
  result.modResults.manifest["uses-permission"] = existing.filter((item) => item.$["android:name"] !== permission)
  if (config.android?.package === "com.ewatrade.preview") {
    result.modResults.manifest["uses-permission"].push({ $: { "android:name": permission } })
  }
  return result
})
