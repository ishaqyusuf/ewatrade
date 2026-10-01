const { describe, expect, test } = require("bun:test")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const {
  addIosPodDeploymentTarget,
} = require("./with-ios-pod-deployment-target.cjs")

describe("iOS Pod deployment target config", () => {
  test("adds the post-install floor once to the current Podfile template", () => {
    const podfile = readFileSync(join(__dirname, "../ios/Podfile"), "utf8")
    const updated = addIosPodDeploymentTarget(podfile)

    expect(updated).toContain("Gem::Version.new('15.1')")
    expect(updated).toContain(
      "configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'",
    )
    expect(addIosPodDeploymentTarget(updated)).toBe(updated)
  })

  test("fails if the Expo post-install hook changes", () => {
    expect(() => addIosPodDeploymentTarget("platform :ios, '15.1'\n")).toThrow(
      "post_install is missing",
    )
  })
})
