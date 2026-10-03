import { afterEach, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  type EwaTradeProviderBundle,
  MOBILE_TARGET,
} from "../.release/ewatrade-provider-bundle"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { releaseContract } from "./release-contract"
import { compareExpoNativeEnvironment } from "./release-expo-environment"
import {
  assertMobileBuildReady,
  assertNativeBuildEvidence,
  assertReviewedNativeBuildBaseline,
} from "./release-mobile-build-preflight"
import { resolveNativeEnvironment } from "./release-mobile-environment"
import { assertMobilePublishReady } from "./release-mobile-preflight"
import { committedSourceFingerprints, releaseGit } from "./release-source"

const root = resolve(import.meta.dir, "..")
const toolkitRevision = "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7"
const secret = "owned-native-build-test-secret-with-32-bytes"
type EasProfileFixture = {
  environment: string
  channel: string
  autoIncrement: boolean
  extends?: string
  env?: Record<string, string>
  android?: { autoIncrement?: boolean; env?: Record<string, string> }
  ios?: { simulator?: boolean; env?: Record<string, string> }
}
type EasFixture = {
  cli: { appVersionSource: string }
  build: { preview: EasProfileFixture; production: EasProfileFixture }
}
const repositories: string[] = []
const prior = {
  envelope: process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE,
  key: process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY,
}
const manifest = JSON.parse(
  readFileSync(join(root, "release.manifest.json"), "utf8"),
) as ReleaseManifest

afterEach(() => {
  for (const repository of repositories.splice(0))
    rmSync(repository, { recursive: true, force: true })
  for (const [key, value] of Object.entries({
    EWATRADE_RELEASE_EVIDENCE_ENVELOPE: prior.envelope,
    EWATRADE_RELEASE_EVIDENCE_HMAC_KEY: prior.key,
  })) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})

function fixture(
  environment: "preview" | "production" = "preview",
  changed = false,
) {
  const repository = mkdtempSync(join(tmpdir(), "ewatrade-native-build-"))
  repositories.push(repository)
  const git = (...args: string[]) =>
    releaseGit(repository, ["-c", "core.hooksPath=/dev/null", ...args])
  git("init", "-q", "--initial-branch=main")
  git("config", "user.name", "Owned release fixture")
  git("config", "user.email", "release@example.invalid")
  mkdirSync(join(repository, "apps/mobile"), { recursive: true })
  writeFileSync(
    join(repository, "release.manifest.json"),
    JSON.stringify(manifest),
  )
  const profile = (environment: string): EasProfileFixture => ({
    environment,
    channel: environment,
    autoIncrement: true,
  })
  const eas: EasFixture = {
    cli: { appVersionSource: "remote" },
    build: { preview: profile("preview"), production: profile("production") },
  }
  writeFileSync(join(repository, "apps/mobile/eas.json"), JSON.stringify(eas))
  writeFileSync(
    join(repository, "apps/mobile/app.config.ts"),
    'throw new Error("candidate config must not execute")\n',
  )
  git("add", ".")
  git("commit", "-qm", "baseline")
  const baselineRevision = git("rev-parse", "HEAD")
  if (changed) {
    writeFileSync(
      join(repository, "apps/mobile/app.config.ts"),
      'throw new Error("reviewed native source must not execute")\n',
    )
    git("add", ".")
  }
  git("commit", "--allow-empty", "-qm", "candidate")
  const revision = git("rev-parse", "HEAD")
  const selected = MOBILE_TARGET[environment]
  const appVersion = changed ? "1.1.0" : "1.0.0"
  const bundle: EwaTradeProviderBundle = {
    version: 1,
    project: "ewatrade",
    revision,
    environment,
    generatedAt: new Date().toISOString(),
    toolkitRevision,
    policyFingerprint: releaseContract(root, toolkitRevision).policyFingerprint,
    sourceFingerprints: committedSourceFingerprints(
      repository,
      revision,
      manifest,
    ),
    receipts: [],
    evidence: [],
    liveState: [],
    fingerprints: {},
    vercel: {
      deploymentIds: {},
      deployments: [],
      domains: [],
    },
    jobs: {
      deploymentIds: {},
      deployments: [],
      configurationFingerprints: {},
      waivers: [],
    },
    expo: {
      nativeConfiguration: {
        appVersion,
        runtimePolicies: { android: "appVersion", ios: "appVersion" },
      },
      fingerprints: { android: "a".repeat(40), ios: "b".repeat(64) },
      runtimeVersions: { android: appVersion, ios: appVersion },
      baselineBuildIds: { android: "android-base", ios: "ios-base" },
      newBuildIds: {},
      updateGroupIds: {},
      updates: [],
      channels: [
        {
          projectId: MOBILE_TARGET.projectId,
          channel: selected.channel,
          branch: selected.branch,
        },
      ],
      builds: (["android", "ios"] as const).map((platform) => ({
        id: `${platform}-base`,
        platform,
        projectId: MOBILE_TARGET.projectId,
        profile: selected.profile,
        channel: selected.channel,
        revision: baselineRevision,
        runtimeVersion: "1.0.0",
        appVersion: "1.0.0",
        appBuildVersion: "9",
        fingerprint: platform === "android" ? "a".repeat(40) : "b".repeat(64),
        status: "finished",
        availability: "available",
      })),
    },
  }
  bundle.expo.nativeEnvironment = resolveNativeEnvironment(
    {
      revision,
      environment,
      sourceFingerprint: bundle.sourceFingerprints?.mobile ?? "",
    },
    {},
  ).state
  bundle.expo.nativeEnvironmentParity = compareExpoNativeEnvironment(
    {
      revision,
      environment,
      sourceFingerprint: bundle.sourceFingerprints?.mobile ?? "",
    },
    bundle.expo.nativeEnvironment,
    eas,
    {
      data: {
        app: {
          byId: {
            id: MOBILE_TARGET.projectId,
            slug: "ewatrade",
            projectVariables: [],
            ownerAccount: {
              id: "owned-test-account",
              name: "cipron-startups",
              accountVariables: [],
            },
          },
        },
      },
    },
    {},
  )
  const input = {
    repository,
    revision,
    environment,
    platforms: ["android", "ios"] as Array<"android" | "ios">,
  }
  return { input, bundle, git, eas }
}

function configuration(bundle: EwaTradeProviderBundle) {
  const configuration = bundle.expo.nativeConfiguration
  if (!configuration) throw new Error("Missing fixture native configuration")
  return configuration
}

function configure(bundle: EwaTradeProviderBundle) {
  const payload = Buffer.from(JSON.stringify(bundle)).toString("base64url")
  process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY = secret
  process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE = JSON.stringify({
    version: 1,
    payload,
    signature: createHmac("sha256", secret).update(payload).digest("hex"),
  })
}

test("trusted signed build preflight accepts unchanged rebuilds and reviewed native version increases in both environments", async () => {
  for (const environment of ["preview", "production"] as const)
    for (const changed of [false, true]) {
      const { input, bundle } = fixture(environment, changed)
      configure(bundle)
      expect(await assertMobileBuildReady(input)).toEqual({
        revision: input.revision,
        environment,
        platforms: ["android", "ios"],
      })
    }
})

test("requires native runtime increase from source paths even when aggregate fingerprints are equal", () => {
  const { input, bundle } = fixture("preview", true)
  configuration(bundle).appVersion = "1.0.0"
  bundle.expo.runtimeVersions = { android: "1.0.0", ios: "1.0.0" }
  expect(() =>
    assertReviewedNativeBuildBaseline(input, bundle, manifest),
  ).toThrow("strictly increased")
})

test("requires selected platform policy and refuses ambiguous/foreign/unavailable baselines", () => {
  const mutations: Array<(b: EwaTradeProviderBundle) => void> = [
    (b) => {
      b.expo.nativeConfiguration = undefined
    },
    (b) => {
      configuration(b).runtimePolicies.android = "explicit"
    },
    (b) => {
      configuration(b).appVersion = "2.0.0"
    },
    (b) => {
      b.revision = "f".repeat(40)
    },
    (b) => {
      b.environment = "production"
    },
    (b) => {
      b.expo.channels[0].branch = "production"
    },
    (b) => {
      b.expo.channels.push(b.expo.channels[0])
    },
    (b) => {
      b.expo.builds[0].projectId = "foreign"
    },
    (b) => {
      b.expo.builds[0].platform = "ios"
    },
    (b) => {
      b.expo.builds[0].profile = "production"
    },
    (b) => {
      b.expo.builds[0].channel = "production"
    },
    (b) => {
      b.expo.builds[0].status = "pending"
    },
    (b) => {
      b.expo.builds[0].availability = "unavailable"
    },
    (b) => {
      b.expo.builds[0].revision = "f".repeat(40)
    },
    (b) => {
      b.expo.builds[0].appVersion = null
    },
    (b) => {
      b.expo.builds[0].appBuildVersion = null
    },
    (b) => {
      b.expo.builds.push(b.expo.builds[0])
    },
  ]
  const { input, bundle } = fixture()
  for (const mutate of mutations) {
    const copy = structuredClone(bundle)
    mutate(copy)
    expect(() =>
      assertReviewedNativeBuildBaseline(
        { ...input, platforms: ["android"] },
        copy,
        manifest,
      ),
    ).toThrow()
  }
  bundle.expo.builds = bundle.expo.builds.filter(
    (b) => b.platform === "android",
  )
  configuration(bundle).runtimePolicies.ios = null
  expect(() =>
    assertReviewedNativeBuildBaseline(
      { ...input, platforms: ["android"] },
      bundle,
      manifest,
    ),
  ).not.toThrow()
  expect(() =>
    assertReviewedNativeBuildBaseline(input, bundle, manifest),
  ).toThrow()
  expect(() =>
    assertReviewedNativeBuildBaseline(
      { ...input, platforms: ["android", "android"] },
      bundle,
      manifest,
    ),
  ).toThrow("Choose")
})

test("reads committed EAS policy and rejects version/profile/platform overrides", () => {
  for (const mutate of [
    (e: EasFixture) => {
      e.cli.appVersionSource = "local"
    },
    (e: EasFixture) => {
      e.build.preview.autoIncrement = false
    },
    (e: EasFixture) => {
      e.build.preview.extends = "production"
    },
    (e: EasFixture) => {
      e.build.preview.environment = "production"
    },
    (e: EasFixture) => {
      e.build.preview.channel = "production"
    },
    (e: EasFixture) => {
      e.build.preview.env = { APP_VARIANT: "production" }
    },
    (e: EasFixture) => {
      e.build.preview.android = { autoIncrement: false }
    },
    (e: EasFixture) => {
      e.build.preview.ios = { simulator: true }
    },
    (e: EasFixture) => {
      e.build.preview.env = {
        EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat.example.com",
      }
    },
    (e: EasFixture) => {
      e.build.preview.env = { EAS_BUILD_PROFILE: "production" }
    },
    (e: EasFixture) => {
      e.build.preview.android = { env: {} }
    },
    (e: EasFixture) => {
      e.build.preview.ios = { env: {} }
    },
  ]) {
    const { input, bundle, eas, git } = fixture()
    mutate(eas)
    writeFileSync(
      join(input.repository, "apps/mobile/eas.json"),
      JSON.stringify(eas),
    )
    git("add", ".")
    git("commit", "-qm", "invalid build policy")
    input.revision = git("rev-parse", "HEAD")
    bundle.revision = input.revision
    bundle.sourceFingerprints = committedSourceFingerprints(
      input.repository,
      input.revision,
      manifest,
    )
    bundle.expo.nativeEnvironment = resolveNativeEnvironment(
      {
        revision: input.revision,
        environment: input.environment,
        sourceFingerprint: bundle.sourceFingerprints.mobile,
      },
      {},
    ).state
    expect(() =>
      assertReviewedNativeBuildBaseline(input, bundle, manifest),
    ).toThrow()
  }
})

test("native build preflight refuses missing or altered native environment metadata", () => {
  const { input, bundle } = fixture()
  const state = bundle.expo.nativeEnvironment
  if (!state) throw new Error("Missing fixture native environment")
  for (const altered of [
    undefined,
    { ...state, bindingFingerprint: "f".repeat(64) },
    { ...state, fingerprint: "e".repeat(64) },
    { ...state, keys: ["EXPO_PUBLIC_CUSTOMER_CHAT_HOST" as const] },
  ]) {
    bundle.expo.nativeEnvironment = altered
    expect(() =>
      assertReviewedNativeBuildBaseline(input, bundle, manifest),
    ).toThrow("Signed native environment")
  }
})

test("both native build and OTA preflight require a fresh exact signed environment parity receipt", async () => {
  const { input, bundle } = fixture()
  configure(bundle)
  expect(await assertMobilePublishReady(input)).toMatchObject({
    revision: input.revision,
    environment: input.environment,
  })
  const receipt = bundle.expo.nativeEnvironmentParity
  if (!receipt) throw new Error("Missing parity fixture")
  for (const altered of [
    undefined,
    { ...receipt, observedAt: new Date(Date.now() - 600_000).toISOString() },
    { ...receipt, queryFingerprint: "f".repeat(64) },
    { ...receipt, profileFingerprint: "f".repeat(64) },
    { ...receipt, values: { EXPO_TOKEN: "must-not-be-exported" } },
  ]) {
    const copy = structuredClone(bundle)
    copy.expo.nativeEnvironmentParity = altered
    configure(copy)
    await expect(assertMobileBuildReady(input)).rejects.toThrow(
      "parity receipt",
    )
    await expect(assertMobilePublishReady(input)).rejects.toThrow(
      "parity receipt",
    )
    expect(() =>
      assertReviewedNativeBuildBaseline(input, copy, manifest),
    ).toThrow("parity receipt")
  }
})

test("trusted boundary rejects dirty source, stale signatures, wrong revision and source binding", async () => {
  const { input, bundle } = fixture()
  for (const mutate of [
    (b: EwaTradeProviderBundle) => {
      b.generatedAt = new Date(Date.now() - 600_000).toISOString()
    },
    (b: EwaTradeProviderBundle) => {
      b.revision = "f".repeat(40)
    },
    (b: EwaTradeProviderBundle) => {
      b.sourceFingerprints = { ...b.sourceFingerprints, mobile: "f".repeat(64) }
    },
    (b: EwaTradeProviderBundle) => {
      b.policyFingerprint = "f".repeat(64)
    },
  ]) {
    const copy = structuredClone(bundle)
    mutate(copy)
    configure(copy)
    await expect(assertMobileBuildReady(input)).rejects.toThrow()
  }
  configure(bundle)
  writeFileSync(join(input.repository, "apps/mobile/eas.json"), "{}")
  await expect(assertMobileBuildReady(input)).rejects.toThrow(
    "changed mobile release inputs",
  )
})

test("post-build proof requires exact finished builds and actually advanced provider numbers", () => {
  const { input, bundle } = fixture("preview", true)
  for (const baseline of [...bundle.expo.builds]) {
    bundle.expo.newBuildIds[baseline.platform] = `${baseline.platform}-new`
    bundle.expo.builds.push({
      ...baseline,
      id: `${baseline.platform}-new`,
      revision: input.revision,
      appVersion: "1.1.0",
      runtimeVersion: "1.1.0",
      appBuildVersion: baseline.platform === "ios" ? "9.0.1" : "10",
    })
  }
  expect(() => assertNativeBuildEvidence(input, bundle, manifest)).not.toThrow()
  for (const mutate of [
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].appBuildVersion = "9"
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].appBuildVersion = null
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].appVersion = "1.0.0"
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].revision = "f".repeat(40)
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].fingerprint = "f".repeat(40)
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].runtimeVersion = "1.0.0"
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.builds[2].status = "pending"
    },
    (b: EwaTradeProviderBundle) => {
      b.expo.newBuildIds.android = "android-base"
    },
  ]) {
    const copy = structuredClone(bundle)
    mutate(copy)
    expect(() => assertNativeBuildEvidence(input, copy, manifest)).toThrow()
  }
})
