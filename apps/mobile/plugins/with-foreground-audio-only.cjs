const { withAndroidManifest } = require("expo/config-plugins")

const UNUSED_AUDIO_SERVICES = [
  "expo.modules.audio.service.AudioControlsService",
  "expo.modules.audio.service.AudioRecordingService",
]

function removeUnusedAudioServices(manifest) {
  const application = manifest.manifest.application?.[0]
  if (!application) throw new Error("Android application manifest is missing")
  application.service ??= []
  for (const name of UNUSED_AUDIO_SERVICES) {
    if (application.service.some((service) => service.$?.["android:name"] === name))
      continue
    application.service.push({
      $: { "android:name": name, "tools:node": "remove" },
    })
  }
  return manifest
}

const withForegroundAudioOnly = (config) =>
  withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = removeUnusedAudioServices(modConfig.modResults)
    return modConfig
  })

module.exports = withForegroundAudioOnly
module.exports.removeUnusedAudioServices = removeUnusedAudioServices
