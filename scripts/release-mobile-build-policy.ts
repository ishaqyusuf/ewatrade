import { validExpoFingerprint } from "./release-mobile-fingerprint"

export type NativeRuntimePolicy = "appVersion" | "fingerprint" | "explicit"
export type NativeBuildConfiguration = {
  appVersion: string | null
  runtimePolicies: Record<"android" | "ios", NativeRuntimePolicy | null>
}

type Platform = "android" | "ios"

type BaselineBuild = {
  fingerprint: string
  runtimeVersion: string
  appVersion?: string | null
  appBuildVersion?: string | null
}

function canonicalAppVersion(value: unknown, label: string): string[] {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)
  )
    throw new Error(`${label} must be a canonical three-part app version.`)
  return value.split(".")
}

function compareParts(left: string[], right: string[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = BigInt(left[index] ?? "0")
    const b = BigInt(right[index] ?? "0")
    if (a < b) return -1
    if (a > b) return 1
  }
  return 0
}

function parseBuildNumber(value: unknown, platform: Platform): string[] {
  if (typeof value !== "string" || value.length > 128)
    throw new Error(
      `${platform}: provider baseline build number is unavailable.`,
    )

  if (platform === "android") {
    if (!/^[1-9][0-9]*$/.test(value))
      throw new Error(
        "android: build number must be a positive canonical integer.",
      )
    return [value]
  }

  if (!/^[1-9][0-9]*(?:\.(?:0|[1-9][0-9]*)){0,2}$/.test(value))
    throw new Error(
      "ios: build number must be one to three canonical numeric components.",
    )
  return value.split(".")
}

/** Enforce the reviewed appVersion runtime contract before a native build. */
export function assertAppVersionBuildPolicy(input: {
  platform: Platform
  configuration: NativeBuildConfiguration
  fingerprint: string
  runtimeVersion: string
  baseline: BaselineBuild
  /** Derived from trusted baseline-to-candidate committed Git paths. */
  nativeInputsChanged: boolean
}): void {
  const { platform, configuration, baseline } = input
  if (
    !configuration ||
    typeof configuration !== "object" ||
    !configuration.runtimePolicies ||
    typeof configuration.runtimePolicies !== "object"
  )
    throw new Error(`${platform}: native build configuration is unavailable.`)
  if (configuration.runtimePolicies[platform] !== "appVersion")
    throw new Error(
      `${platform}: only the reviewed appVersion runtime policy is accepted.`,
    )

  const candidateParts = canonicalAppVersion(
    configuration.appVersion,
    `${platform}: candidate appVersion`,
  )
  const baselineParts = canonicalAppVersion(
    baseline?.appVersion,
    `${platform}: baseline appVersion`,
  )
  if (
    !validExpoFingerprint(input.fingerprint) ||
    !validExpoFingerprint(baseline?.fingerprint)
  )
    throw new Error(`${platform}: native fingerprint is missing or malformed.`)
  if (
    input.runtimeVersion !== configuration.appVersion ||
    baseline.runtimeVersion !== baseline.appVersion
  )
    throw new Error(`${platform}: runtimeVersion must equal its appVersion.`)
  parseBuildNumber(baseline.appBuildVersion, platform)

  const versionOrder = compareParts(candidateParts, baselineParts)
  if (versionOrder < 0)
    throw new Error(
      `${platform}: appVersion cannot decrease from the provider baseline.`,
    )

  const nativeChanged =
    input.nativeInputsChanged || input.fingerprint !== baseline.fingerprint
  if (nativeChanged && versionOrder <= 0)
    throw new Error(
      `${platform}: native changes require a strictly increased appVersion runtime.`,
    )
}

/** Require EAS's next provider build number to increase under platform syntax. */
export function assertNativeBuildNumberAdvanced(
  platform: Platform,
  baselineValue: string | null | undefined,
  newValue: string | null | undefined,
): void {
  const baseline = parseBuildNumber(baselineValue, platform)
  const next = parseBuildNumber(newValue, platform)
  if (compareParts(next, baseline) <= 0)
    throw new Error(`${platform}: provider build number must advance.`)
}
