const { withPodfile } = require("expo/config-plugins")

const MARKER = "# Keep third-party Pods within Xcode's supported iOS range."
const POST_INSTALL_END = "\n  end\nend"

function addIosPodDeploymentTarget(podfile) {
  if (podfile.includes(MARKER)) return podfile

  const postInstallStart = podfile.indexOf("  post_install do |installer|")
  const postInstallEnd = podfile.indexOf(POST_INSTALL_END, postInstallStart)
  if (postInstallStart < 0 || postInstallEnd < 0) {
    throw new Error(
      "Unable to configure iOS Pod deployment targets: post_install is missing.",
    )
  }

  const minimumTarget = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |configuration|
        current = configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        version = Gem::Version.new(current.to_s) rescue nil
        if version.nil? || version < Gem::Version.new('15.1')
          configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`

  return `${podfile.slice(0, postInstallEnd)}${minimumTarget}${podfile.slice(postInstallEnd)}`
}

const withIosPodDeploymentTarget = (config) =>
  withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = addIosPodDeploymentTarget(
      modConfig.modResults.contents,
    )
    return modConfig
  })

module.exports = withIosPodDeploymentTarget
module.exports.addIosPodDeploymentTarget = addIosPodDeploymentTarget
