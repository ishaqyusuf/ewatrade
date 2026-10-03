#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  type EwaTradeProviderBundle,
  MOBILE_TARGET,
  loadSignedProviderBundle,
} from "../.release/ewatrade-provider-bundle"
import type { ExpoPlatform } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/expo"
import { matchesAny } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/manifest"
import type { ReleaseManifest } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/plan"
import { verifyVendorSnapshot } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/vendor"
import { assertBundleContract, releaseContract } from "./release-contract"
import { assertExpoNativeEnvironmentReceipt } from "./release-expo-environment"
import { validExpoFingerprint } from "./release-mobile-fingerprint"
import {
  assertReleaseRevision,
  assertTrustedTopology,
  committedManifest,
  committedSourceFingerprints,
  dirtyReleaseInputs,
  releaseGit,
} from "./release-source"

export type MobileReleasePreflightInput = {
  repository: string
  environment: "preview" | "production"
  revision: string
  platforms: ExpoPlatform[]
}

/** Pre-publication compatibility; published update proof belongs to the later CI gate. */
export function assertCompatibleMobileBaseline(
  input: MobileReleasePreflightInput,
  bundle: EwaTradeProviderBundle,
  manifest: ReleaseManifest,
) {
  if (
    !input.platforms.length ||
    new Set(input.platforms).size !== input.platforms.length ||
    input.platforms.some((item) => !MOBILE_TARGET.platforms.includes(item))
  )
    throw new Error("Choose android, ios, or both mobile platforms.")
  const mobile = manifest.targets.find(
    (target) => target.id === MOBILE_TARGET.targetId,
  )
  if (!mobile) throw new Error("Mobile release target is missing.")
  const expected = MOBILE_TARGET[input.environment]
  const channel = bundle.expo.channels.find(
    (item) =>
      item.projectId === MOBILE_TARGET.projectId &&
      item.channel === expected.channel,
  )
  if (channel?.branch !== expected.branch)
    throw new Error(
      "Mobile channel does not point to the intended release branch.",
    )
  for (const platform of input.platforms) {
    const baselineId = bundle.expo.baselineBuildIds[platform]
    const baseline = bundle.expo.builds.find((item) => item.id === baselineId)
    if (
      !baseline ||
      baseline.projectId !== MOBILE_TARGET.projectId ||
      baseline.platform !== platform ||
      baseline.profile !== expected.profile ||
      baseline.channel !== expected.channel ||
      baseline.status !== "finished" ||
      baseline.availability !== "available"
    )
      throw new Error(`${platform}: compatible baseline build is unavailable.`)
    const fingerprint = bundle.expo.fingerprints[platform]
    const runtime = bundle.expo.runtimeVersions[platform]
    if (
      !fingerprint ||
      !validExpoFingerprint(fingerprint) ||
      !runtime ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runtime) ||
      fingerprint !== baseline.fingerprint ||
      runtime !== baseline.runtimeVersion
    )
      throw new Error(
        `${platform}: native fingerprint/runtime changed or is unknown; a native build is required.`,
      )
    let changes: string[]
    try {
      if (!/^[0-9a-f]{40}$/i.test(baseline.revision))
        throw new Error("Invalid baseline revision")
      releaseGit(input.repository, [
        "merge-base",
        "--is-ancestor",
        baseline.revision,
        input.revision,
      ])
      changes = releaseGit(input.repository, [
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
    } catch {
      throw new Error(
        `${platform}: baseline source history is unavailable; OTA compatibility cannot be established.`,
      )
    }
    if (
      changes.some((path) =>
        matchesAny(path, mobile.nativeCandidatePaths ?? []),
      )
    )
      throw new Error(
        `${platform}: native candidate inputs changed; a reviewed native build/runtime decision is required.`,
      )
  }
  return {
    revision: input.revision,
    environment: input.environment,
    platforms: input.platforms,
  }
}

export function loadTrustedMobilePreflight(input: MobileReleasePreflightInput) {
  const trustedRoot = resolve(import.meta.dir, "..")
  const lock = verifyVendorSnapshot(trustedRoot)
  const repository = assertReleaseRevision(input.repository, input.revision)
  const manifest = committedManifest(repository, input.revision)
  const trusted = JSON.parse(
    readFileSync(resolve(import.meta.dir, "../release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  assertTrustedTopology(manifest, trusted)
  const mobileManifest = {
    ...manifest,
    targets: manifest.targets.filter((target) => target.id === "mobile"),
  }
  if (dirtyReleaseInputs(repository, mobileManifest).length)
    throw new Error(
      "Commit or remove all changed mobile release inputs before release.",
    )
  const bundle = loadSignedProviderBundle({
    ...input,
    repository,
    toolkitRevision: lock.toolkitRevision,
  })
  assertBundleContract(
    bundle,
    releaseContract(trustedRoot, lock.toolkitRevision),
  )
  const source = committedSourceFingerprints(
    repository,
    input.revision,
    manifest,
  )
  if (bundle.sourceFingerprints?.mobile !== source.mobile)
    throw new Error(
      "Signed mobile source fingerprint is missing or does not match this revision.",
    )
  assertMobileEnvironmentReceipt({ ...input, repository }, bundle)
  return { repository, bundle, manifest }
}

export function assertMobileEnvironmentReceipt(
  input: Omit<MobileReleasePreflightInput, "platforms">,
  bundle: EwaTradeProviderBundle,
) {
  let eas: unknown
  try {
    eas = JSON.parse(
      releaseGit(input.repository, [
        "show",
        `${input.revision}:apps/mobile/eas.json`,
      ]),
    )
  } catch {
    throw new Error(
      "Committed EAS environment configuration is unavailable or malformed.",
    )
  }
  assertExpoNativeEnvironmentReceipt(
    {
      revision: input.revision,
      environment: input.environment,
      sourceFingerprint: bundle.sourceFingerprints?.mobile ?? "",
    },
    bundle.expo.nativeEnvironment,
    eas,
    bundle.expo.nativeEnvironmentParity,
  )
}

export async function assertMobilePublishReady(
  input: MobileReleasePreflightInput,
) {
  const { repository, bundle, manifest } = loadTrustedMobilePreflight(input)
  return assertCompatibleMobileBaseline(
    { ...input, repository },
    bundle,
    manifest,
  )
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2)
    if (
      args.length !== 6 ||
      args[0] !== "--env" ||
      !["preview", "production"].includes(args[1]) ||
      args[2] !== "--revision" ||
      args[4] !== "--platform" ||
      !["android", "ios", "all"].includes(args[5])
    )
      throw new Error(
        "Use --env preview|production --revision <full SHA> --platform android|ios|all.",
      )
    await assertMobilePublishReady({
      repository: resolve(import.meta.dir, ".."),
      environment: args[1] as "preview" | "production",
      revision: args[3],
      platforms:
        args[5] === "all" ? ["android", "ios"] : [args[5] as ExpoPlatform],
    })
    console.log("Exact-revision mobile OTA compatibility verified.")
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Mobile publication preflight failed.",
    )
    process.exitCode = 2
  }
}
