import {
  type EwaTradeExpoBuildRecord,
  type EwaTradeProviderBundle,
  MOBILE_TARGET,
} from "../.release/ewatrade-provider-bundle"
import type { ExpoPlatform } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/expo"
import { matchesAny } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/manifest"
import type { ReleaseManifest } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/plan"
import {
  assertAppVersionBuildPolicy,
  assertNativeBuildNumberAdvanced,
} from "./release-mobile-build-policy"
import {
  type NativeEnvironmentValues,
  assertNativeEnvironmentState,
  assertNativeProfileEnvironment,
  resolveNativeEnvironment,
} from "./release-mobile-environment"
import {
  type MobileReleasePreflightInput,
  assertMobileEnvironmentReceipt,
  loadTrustedMobilePreflight,
} from "./release-mobile-preflight"
import { releaseGit } from "./release-source"

type BuildContext = Omit<MobileReleasePreflightInput, "platforms">

/** EAS configuration is committed JSON data; candidate app configuration is never executed. */
export function assertCommittedNativeBuildProfile(
  input: MobileReleasePreflightInput,
  nativeValues: NativeEnvironmentValues,
) {
  let config: Record<string, unknown>
  try {
    config = object(
      JSON.parse(
        releaseGit(input.repository, [
          "show",
          `${input.revision}:apps/mobile/eas.json`,
        ]),
      ),
    )
  } catch {
    throw new Error(
      "Committed EAS build configuration is unavailable or malformed.",
    )
  }
  if (object(config.cli).appVersionSource !== "remote")
    throw new Error(
      "Hosted native builds require the reviewed remote build-version source.",
    )
  const expected = MOBILE_TARGET[input.environment]
  const profile = object(object(config.build)[expected.profile])
  if (
    profile.extends !== undefined ||
    profile.environment !== input.environment ||
    profile.channel !== expected.channel
  )
    throw new Error(
      "Committed EAS profile must directly bind the selected environment and channel.",
    )
  assertNativeProfileEnvironment(profile, input.environment, nativeValues)
  for (const platform of input.platforms) {
    const override = object(profile[platform])
    if ((override.autoIncrement ?? profile.autoIncrement) !== true)
      throw new Error(
        `${platform}: hosted build numbers must auto-increment remotely.`,
      )
    if (platform === "ios" && override.simulator === true)
      throw new Error("Hosted release proof requires an iOS device build.")
  }
}

export function assertReviewedNativeBuildBaseline(
  input: MobileReleasePreflightInput,
  bundle: EwaTradeProviderBundle,
  manifest: ReleaseManifest,
) {
  if (
    !input.platforms.length ||
    new Set(input.platforms).size !== input.platforms.length ||
    input.platforms.some(
      (platform) => !MOBILE_TARGET.platforms.includes(platform),
    )
  )
    throw new Error("Choose android, ios, or both native build platforms.")
  if (
    bundle.project !== "ewatrade" ||
    bundle.revision !== input.revision ||
    bundle.environment !== input.environment
  )
    throw new Error(
      "Native build proof is not bound to the selected revision and environment.",
    )
  const mobile = manifest.targets.find(
    (target) => target.id === MOBILE_TARGET.targetId,
  )
  if (!mobile) throw new Error("Mobile release target is missing.")
  const nativeContext = {
    revision: input.revision,
    environment: input.environment,
    sourceFingerprint: bundle.sourceFingerprints?.mobile ?? "",
  }
  assertNativeEnvironmentState(nativeContext, bundle.expo.nativeEnvironment)
  assertCommittedNativeBuildProfile(
    input,
    resolveNativeEnvironment(nativeContext).values,
  )
  assertMobileEnvironmentReceipt(input, bundle)
  const expected = MOBILE_TARGET[input.environment]
  const channels = bundle.expo.channels.filter(
    (channel) =>
      channel.projectId === MOBILE_TARGET.projectId &&
      channel.channel === expected.channel,
  )
  if (channels.length !== 1 || channels[0]?.branch !== expected.branch)
    throw new Error(
      "Native build channel does not uniquely match its owned release branch.",
    )
  const configuration = bundle.expo.nativeConfiguration
  if (!configuration)
    throw new Error(
      "Signed independently resolved native configuration is unavailable.",
    )
  for (const platform of input.platforms) {
    const baseline = selectBuild(
      bundle,
      bundle.expo.baselineBuildIds[platform],
      platform,
      input.environment,
    )
    const nativeInputsChanged = changedNativeInputs(
      input,
      baseline,
      mobile.nativeCandidatePaths ?? [],
    )
    assertAppVersionBuildPolicy({
      platform,
      configuration,
      fingerprint: bundle.expo.fingerprints[platform] ?? "",
      runtimeVersion: bundle.expo.runtimeVersions[platform] ?? "",
      nativeInputsChanged,
      baseline,
    })
  }
  return {
    revision: input.revision,
    environment: input.environment,
    platforms: [...input.platforms],
  }
}

/** Before credentials/build launch: no future build number or successful build is claimed. */
export async function assertMobileBuildReady(
  input: MobileReleasePreflightInput,
) {
  const { repository, bundle, manifest } = loadTrustedMobilePreflight(input)
  return assertReviewedNativeBuildBaseline(
    { ...input, repository },
    bundle,
    manifest,
  )
}

/** Post-build proof checks actual provider versions, never a predicted auto-increment value. */
export function assertNativeBuildEvidence(
  context: BuildContext,
  bundle: EwaTradeProviderBundle,
  manifest: ReleaseManifest,
) {
  const ids = bundle.expo.newBuildIds
  if (!ids || typeof ids !== "object" || Array.isArray(ids))
    throw new Error("Native build selection is malformed.")
  if (
    Object.keys(ids).some(
      (key) => !MOBILE_TARGET.platforms.includes(key as ExpoPlatform),
    )
  )
    throw new Error("Native build selection contains an unknown platform.")
  const platforms = MOBILE_TARGET.platforms.filter(
    (platform) => ids[platform] !== undefined && ids[platform] !== null,
  )
  if (!platforms.length) return
  assertReviewedNativeBuildBaseline({ ...context, platforms }, bundle, manifest)
  for (const platform of platforms) {
    const baseline = selectBuild(
      bundle,
      bundle.expo.baselineBuildIds[platform],
      platform,
      context.environment,
    )
    const build = selectBuild(
      bundle,
      ids[platform],
      platform,
      context.environment,
    )
    if (
      build.id === baseline.id ||
      build.revision !== context.revision ||
      build.fingerprint !== bundle.expo.fingerprints[platform] ||
      build.runtimeVersion !== bundle.expo.runtimeVersions[platform] ||
      build.appVersion !== bundle.expo.nativeConfiguration?.appVersion
    )
      throw new Error(
        `${platform}: new native build does not match the exact reviewed source/runtime/version.`,
      )
    assertNativeBuildNumberAdvanced(
      platform,
      baseline.appBuildVersion,
      build.appBuildVersion,
    )
  }
}

function selectBuild(
  bundle: EwaTradeProviderBundle,
  id: string | null | undefined,
  platform: ExpoPlatform,
  environment: BuildContext["environment"],
): EwaTradeExpoBuildRecord {
  const records = bundle.expo.builds.filter((build) => build.id === id)
  const build = records[0]
  const expected = MOBILE_TARGET[environment]
  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    records.length !== 1 ||
    !build ||
    build.projectId !== MOBILE_TARGET.projectId ||
    build.platform !== platform ||
    build.profile !== expected.profile ||
    build.channel !== expected.channel ||
    build.status !== "finished" ||
    build.availability !== "available" ||
    !/^[0-9a-f]{40}$/i.test(build.revision)
  )
    throw new Error(
      `${platform}: uniquely owned native build/baseline is unavailable.`,
    )
  return build
}

function changedNativeInputs(
  input: BuildContext,
  baseline: EwaTradeExpoBuildRecord,
  patterns: string[],
) {
  try {
    releaseGit(input.repository, [
      "merge-base",
      "--is-ancestor",
      baseline.revision,
      input.revision,
    ])
    return releaseGit(input.repository, [
      "diff",
      "--no-ext-diff",
      "--no-renames",
      "--name-only",
      "-z",
      baseline.revision,
      input.revision,
    ])
      .split("\0")
      .filter(Boolean)
      .some((path) => matchesAny(path, patterns))
  } catch {
    throw new Error("Native baseline source ancestry is unavailable.")
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
