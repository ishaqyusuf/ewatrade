const { readFile, writeFile } = require("node:fs/promises")
const path = require("node:path")
const { withDangerousMod } = require("expo/config-plugins")

const PODFILE_ANCHOR = "  use_expo_modules!\n"
const MODULAR_HEADER_PODS = ["GoogleUtilities", "RecaptchaInterop"]

function addGoogleSignInModularHeaders(podfile) {
  const missingPods = MODULAR_HEADER_PODS.filter(
    (podName) =>
      !podfile.includes(`pod '${podName}', :modular_headers => true`),
  )
  if (!missingPods.length) return podfile

  if (!podfile.includes(PODFILE_ANCHOR)) {
    throw new Error(
      "Unable to configure Google Sign-In modular headers: Podfile anchor is missing.",
    )
  }

  const declarations = missingPods
    .map((podName) => `  pod '${podName}', :modular_headers => true`)
    .join("\n")
  return podfile.replace(
    PODFILE_ANCHOR,
    `${PODFILE_ANCHOR}\n  # Required by the Swift AppCheckCore dependency used by Google Sign-In.\n${declarations}\n`,
  )
}

const withGoogleSignInModularHeaders = (config) =>
  withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "Podfile",
      )
      const podfile = await readFile(podfilePath, "utf8")
      const nextPodfile = addGoogleSignInModularHeaders(podfile)
      if (nextPodfile !== podfile) await writeFile(podfilePath, nextPodfile)
      return modConfig
    },
  ])

module.exports = {
  addGoogleSignInModularHeaders,
  withGoogleSignInModularHeaders,
}
