import { expect, test } from "bun:test"
import { readFile, readdir } from "node:fs/promises"
import { MOBILE_TARGET } from "../.release/ewatrade-provider-bundle"
import {
  type ExpoSourceState,
  collectExpoProviderState,
  createNeutralExpoConfig,
  parseEnvironmentMetadata,
  validateExpoSourceState,
  withNeutralExpoProject,
} from "./release-expo-collect"
import { collectExpoNativeEnvironment } from "./release-expo-environment"
import { resolveNativeEnvironment } from "./release-mobile-environment"

const revision = "c".repeat(40)
const fingerprint = "a".repeat(64)
const runtimeVersion = "2.3.0"

function sourceState(
  environment: "preview" | "production" = "preview",
): ExpoSourceState {
  return {
    version: 1,
    revision,
    environment,
    sourceFingerprint: "f".repeat(64),
    nativeEnvironment: resolveNativeEnvironment(
      { revision, environment, sourceFingerprint: "f".repeat(64) },
      {},
    ).state,
    nativeConfiguration: {
      appVersion: runtimeVersion,
      runtimePolicies: { android: "appVersion", ios: "appVersion" },
    },
    platforms: {
      android: {
        fingerprint,
        fingerprintAlgorithm: "sha256",
        runtimeVersion,
      },
      ios: {
        fingerprint: "b".repeat(40),
        fingerprintAlgorithm: "sha1",
        runtimeVersion,
      },
    },
  }
}

function environmentOutput(environment: string) {
  return ["API_URL", "LOG_LEVEL"]
    .map(
      (name) =>
        `Name ${name}\nValue SECRET_SENTINEL\nScope PROJECT\nVisibility SENSITIVE\nEnvironments ${environment}`,
    )
    .join("\n———\n")
}

function buildRecord(
  platform: "ANDROID" | "IOS",
  environment: "preview" | "production",
) {
  const expected = MOBILE_TARGET[environment]
  return {
    id: `${environment}-${platform.toLowerCase()}-base`,
    app: {
      id: MOBILE_TARGET.projectId,
      username: "cipron-startups",
      slug: "ewatrade",
    },
    platform,
    buildProfile: expected.profile,
    updateChannel: { name: expected.channel },
    gitCommitHash: revision,
    runtimeVersion,
    appVersion: runtimeVersion,
    appBuildVersion: platform === "ANDROID" ? "21" : "21.0",
    fingerprint: {
      hash: platform === "ANDROID" ? fingerprint : "b".repeat(40),
    },
    status: "FINISHED",
    artifacts: { buildUrl: "https://expo.dev/artifacts/fixture" },
    isForIosSimulator: false,
  }
}

function mockTransport(
  options: {
    wrongProject?: boolean
    update?: boolean
    missingRollout?: boolean
    wrongUpdateGroup?: boolean
    buildVersions?: "missing" | "malformed"
  } = {},
) {
  const calls: Array<{ args: string[]; cwd: string; appConfig: unknown }> = []
  const runReadOnly = async (args: string[], cwd: string) => {
    const files = await readdir(cwd)
    expect(files.sort()).toEqual(["app.json", "package.json"])
    const config = JSON.parse(await readFile(`${cwd}/app.json`, "utf8"))
    calls.push({ args, cwd, appConfig: config })
    const command = args[0]
    if (command === "project:info") {
      return `fullName      @${options.wrongProject ? "other" : "cipron-startups"}/ewatrade\nID            ${MOBILE_TARGET.projectId}\n`
    }
    if (command === "channel:view") {
      const channel = args[1] ?? ""
      return JSON.stringify({
        currentPage: {
          id: `channel-${channel}`,
          name: channel,
          isPaused: false,
          branchMapping: JSON.stringify({
            version: 0,
            data: [
              { branchId: `branch-${channel}`, branchMappingLogic: "true" },
            ],
          }),
        },
      })
    }
    if (command === "branch:list") {
      return JSON.stringify([
        { id: "branch-preview", name: "preview" },
        { id: "branch-production", name: "production" },
      ])
    }
    if (command === "env:list") return environmentOutput(args[1] ?? "")
    if (command === "build:list") {
      const build = buildRecord(
        args[args.indexOf("--platform") + 1] === "ios" ? "IOS" : "ANDROID",
        args[args.indexOf("--channel") + 1] as "preview" | "production",
      )
      if (options.buildVersions === "missing") {
        Reflect.deleteProperty(build, "appVersion")
        Reflect.deleteProperty(build, "appBuildVersion")
      }
      if (options.buildVersions === "malformed")
        build.appBuildVersion = "not-a-version"
      return JSON.stringify([build])
    }
    if (command === "update:list") {
      if (!options.update) return JSON.stringify({ currentPage: [] })
      return JSON.stringify({
        currentPage: [
          {
            group: "update-group",
            ...(options.missingRollout ? {} : { rolloutPercentage: 100 }),
          },
        ],
      })
    }
    if (command === "update:view") {
      return JSON.stringify(
        ["ANDROID", "IOS"].map((platform) => ({
          id: `update-${platform.toLowerCase()}`,
          group: options.wrongUpdateGroup ? "different-group" : "update-group",
          branch: "preview",
          message: "test update",
          runtimeVersion,
          platform,
          gitCommitHash: revision,
        })),
      )
    }
    throw new Error(`unexpected command: ${args.join(" ")}`)
  }
  return { calls, runReadOnly }
}

test("source-state artifacts must match exact revision and environment with both native platforms", () => {
  expect(() =>
    validateExpoSourceState(sourceState(), "d".repeat(40), "preview"),
  ).toThrow("exact revision and environment")
  expect(() =>
    validateExpoSourceState(sourceState(), revision, "production"),
  ).toThrow("exact revision and environment")
  const withoutIos = sourceState()
  // Runtime data may only enter through the explicit versioned source artifact.
  withoutIos.platforms.ios.fingerprint = "unknown"
  expect(() =>
    validateExpoSourceState(withoutIos, revision, "preview"),
  ).toThrow("ios: exact-source")
  const incorrectAlgorithm = sourceState()
  incorrectAlgorithm.platforms.android.fingerprintAlgorithm = "sha1"
  expect(() =>
    validateExpoSourceState(incorrectAlgorithm, revision, "preview"),
  ).toThrow("android: exact-source")
})

test("collects only allowlisted authenticated reads from a neutral Expo project", async () => {
  const { calls, runReadOnly } = mockTransport()
  const collection = await withNeutralExpoProject(async (projectDirectory) => {
    expect(
      JSON.parse(await readFile(`${projectDirectory}/app.json`, "utf8")),
    ).toEqual(createNeutralExpoConfig())
    return collectExpoProviderState({
      environment: "preview",
      revision,
      sourceState: sourceState(),
      baselineBuildIds: {
        android: "preview-android-base",
        ios: "preview-ios-base",
      },
      runReadOnly,
      projectDirectory,
    })
  })
  expect(collection.project).toEqual({
    id: MOBILE_TARGET.projectId,
    owner: "cipron-startups",
    slug: "ewatrade",
  })
  expect(collection.releaseReady).toBe(false)
  expect(collection.revision).toBe(revision)
  expect(collection.environment).toBe("preview")
  expect(Number.isNaN(Date.parse(collection.observedAt))).toBe(false)
  expect(
    collection.expo.builds.map((build) => [
      build.platform,
      build.status,
      build.revision,
    ]),
  ).toEqual([
    ["android", "finished", revision],
    ["ios", "finished", revision],
  ])
  expect(collection.expo.channels).toEqual([
    {
      projectId: MOBILE_TARGET.projectId,
      channel: "preview",
      branch: "preview",
    },
  ])
  expect(
    collection.environmentMetadata.variables.map((item) => item.name),
  ).toEqual(["API_URL", "LOG_LEVEL"])
  expect(JSON.stringify(collection)).not.toContain("SECRET_SENTINEL")
  expect(collection.sourceState.sourceFingerprint).toBe("f".repeat(64))
  expect(collection.expo.nativeConfiguration).toEqual(
    sourceState().nativeConfiguration,
  )
  expect(
    collection.expo.builds.map((build) => [
      build.appVersion,
      build.appBuildVersion,
    ]),
  ).toEqual([
    [runtimeVersion, "21"],
    [runtimeVersion, "21.0"],
  ])
  expect(collection.expo.fingerprints).toEqual({
    android: fingerprint,
    ios: "b".repeat(40),
  })
  expect(calls.map((call) => call.args[0])).toEqual([
    "project:info",
    "channel:view",
    "branch:list",
    "env:list",
    "build:list",
    "build:list",
    "update:list",
  ])
  expect(
    calls.every(
      (call) =>
        JSON.stringify(call.appConfig) ===
        JSON.stringify(createNeutralExpoConfig()),
    ),
  ).toBe(true)
  expect(calls.some((call) => call.args.includes("--include-sensitive"))).toBe(
    false,
  )
})

test("refuses missing or mismatched native environment state before authenticated reads", async () => {
  for (const mutate of [
    (state: ExpoSourceState) => {
      Reflect.deleteProperty(state, "nativeEnvironment")
    },
    (state: ExpoSourceState) => {
      state.nativeEnvironment.fingerprint = "e".repeat(64)
    },
    (state: ExpoSourceState) => {
      state.nativeEnvironment.bindingFingerprint = "e".repeat(64)
    },
    (state: ExpoSourceState) => {
      state.nativeEnvironment.keys = ["EXPO_PUBLIC_CUSTOMER_CHAT_HOST"]
    },
    (state: ExpoSourceState) => {
      Object.assign(state.nativeEnvironment, {
        values: { EXPO_TOKEN: "must-not-be-exported" },
      })
    },
  ]) {
    const state = sourceState()
    mutate(state)
    const { calls, runReadOnly } = mockTransport()
    await expect(
      collectExpoProviderState({
        environment: "preview",
        revision,
        sourceState: state,
        baselineBuildIds: {
          android: "preview-android-base",
          ios: "preview-ios-base",
        },
        runReadOnly,
        projectDirectory: ".",
      }),
    ).rejects.toThrow("Signed native environment")
    expect(calls).toHaveLength(0)
  }
})

test("collector exports validated parity receipts and keeps failed or missing parity visibly unsupported", async () => {
  const state = sourceState()
  const nativeEasConfiguration = {
    build: {
      preview: {
        environment: "preview",
        channel: "preview",
        env: { APP_VARIANT: "preview" },
      },
    },
  }
  const provider = {
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
  }
  for (const fail of [false, true]) {
    let reads = 0
    const transport = mockTransport()
    const collection = await withNeutralExpoProject((projectDirectory) =>
      collectExpoProviderState({
        environment: "preview",
        revision,
        sourceState: state,
        baselineBuildIds: {
          android: "preview-android-base",
          ios: "preview-ios-base",
        },
        nativeEasConfiguration,
        projectDirectory,
        runReadOnly: transport.runReadOnly,
        readNativeEnvironment: (context, source, eas) =>
          collectExpoNativeEnvironment(context, source, eas, {
            token: "private-unit-token",
            configuration: {},
            request: async (url, init) => {
              reads += 1
              expect(url).toBe("https://api.expo.dev/graphql")
              expect(init.method).toBe("POST")
              if (fail) throw new Error("provider-private-body-must-not-appear")
              return new Response(JSON.stringify(provider))
            },
          }),
      }),
    )
    expect(reads).toBe(1)
    expect(collection.releaseReady).toBe(false)
    expect(collection.expo.nativeEnvironmentParity?.matched).toBe(
      fail ? undefined : true,
    )
    expect(
      collection.unsupported.some((reason) =>
        reason.includes("value parity is unverified"),
      ),
    ).toBe(fail)
    expect(JSON.stringify(collection)).not.toContain("private-unit-token")
    expect(JSON.stringify(collection)).not.toContain("provider-private-body")
  }
})

test("committed native profile mismatch refuses before any provider read", async () => {
  const transport = mockTransport()
  await expect(
    collectExpoProviderState({
      environment: "preview",
      revision,
      sourceState: sourceState(),
      baselineBuildIds: {
        android: "preview-android-base",
        ios: "preview-ios-base",
      },
      nativeEasConfiguration: {
        build: {
          preview: {
            environment: "preview",
            channel: "preview",
            env: { EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "unreviewed.example.test" },
          },
        },
      },
      projectDirectory: ".",
      runReadOnly: transport.runReadOnly,
    }),
  ).rejects.toThrow("protected native environment")
  expect(transport.calls).toHaveLength(0)
})

test("requires explicit owner-selected baselines and fails on project or channel mismatch", async () => {
  const first = mockTransport()
  await withNeutralExpoProject(async (projectDirectory) => {
    await expect(
      collectExpoProviderState({
        environment: "preview",
        revision,
        sourceState: sourceState(),
        baselineBuildIds: { android: "preview-android-base" },
        runReadOnly: first.runReadOnly,
        projectDirectory,
      }),
    ).rejects.toThrow("owner-selected Android and iOS baseline")
  })
  const wrongProject = mockTransport({ wrongProject: true })
  await withNeutralExpoProject(async (projectDirectory) => {
    await expect(
      collectExpoProviderState({
        environment: "preview",
        revision,
        sourceState: sourceState(),
        baselineBuildIds: {
          android: "preview-android-base",
          ios: "preview-ios-base",
        },
        runReadOnly: wrongProject.runReadOnly,
        projectDirectory,
      }),
    ).rejects.toThrow("does not match the owned EwaTrade project")
  })
})

test("collects only revision-bound update groups and records published listing status", async () => {
  const { runReadOnly } = mockTransport({ update: true })
  const collection = await withNeutralExpoProject((projectDirectory) =>
    collectExpoProviderState({
      environment: "preview",
      revision,
      sourceState: sourceState(),
      baselineBuildIds: {
        android: "preview-android-base",
        ios: "preview-ios-base",
      },
      runReadOnly,
      projectDirectory,
    }),
  )
  expect(collection.expo.updates).toEqual([
    {
      groupId: "update-group",
      projectId: MOBILE_TARGET.projectId,
      platform: "android",
      channel: "preview",
      branch: "preview",
      revision,
      runtimeVersion,
      status: "published",
      rolloutPercentage: 100,
    },
    {
      groupId: "update-group",
      projectId: MOBILE_TARGET.projectId,
      platform: "ios",
      channel: "preview",
      branch: "preview",
      revision,
      runtimeVersion,
      status: "published",
      rolloutPercentage: 100,
    },
  ])
})

test("does not infer rollout completion and verifies viewed group identity", async () => {
  const missingRollout = mockTransport({ update: true, missingRollout: true })
  await withNeutralExpoProject(async (projectDirectory) => {
    await expect(
      collectExpoProviderState({
        environment: "preview",
        revision,
        sourceState: sourceState(),
        baselineBuildIds: {
          android: "preview-android-base",
          ios: "preview-ios-base",
        },
        runReadOnly: missingRollout.runReadOnly,
        projectDirectory,
      }),
    ).rejects.toThrow("refusing to infer publication completeness")
  })

  const mismatchedGroup = mockTransport({
    update: true,
    wrongUpdateGroup: true,
  })
  await withNeutralExpoProject(async (projectDirectory) => {
    await expect(
      collectExpoProviderState({
        environment: "preview",
        revision,
        sourceState: sourceState(),
        baselineBuildIds: {
          android: "preview-android-base",
          ios: "preview-ios-base",
        },
        runReadOnly: mismatchedGroup.runReadOnly,
        projectDirectory,
      }),
    ).rejects.toThrow("group identity differs")
  })
})

test("environment parser keeps metadata only and rejects malformed records", () => {
  const output =
    "Name PUBLIC_KEY\nValue visible-but-discarded\nScope PROJECT\nVisibility PLAINTEXT\nEnvironments preview, production"
  const metadata = parseEnvironmentMetadata(output, "preview")
  expect(metadata).toEqual([
    {
      name: "PUBLIC_KEY",
      scope: "PROJECT",
      visibility: "PLAINTEXT",
      environments: ["preview", "production"],
    },
  ])
  expect(JSON.stringify(metadata)).not.toContain("visible-but-discarded")
  expect(() =>
    parseEnvironmentMetadata("Name KEY\nScope PROJECT", "preview"),
  ).toThrow("incomplete scope/visibility")
})

test("preserves unavailable provider versions as unknown and refuses malformed metadata", async () => {
  await withNeutralExpoProject(async (projectDirectory) => {
    const missing = await collectExpoProviderState({
      revision,
      environment: "preview",
      sourceState: sourceState(),
      baselineBuildIds: {
        android: "preview-android-base",
        ios: "preview-ios-base",
      },
      projectDirectory,
      runReadOnly: mockTransport({ buildVersions: "missing" }).runReadOnly,
    })
    expect(
      missing.expo.builds.map((build) => [
        build.appVersion,
        build.appBuildVersion,
      ]),
    ).toEqual([
      [null, null],
      [null, null],
    ])
    expect(missing.releaseReady).toBe(false)
    await expect(
      collectExpoProviderState({
        revision,
        environment: "preview",
        sourceState: sourceState(),
        baselineBuildIds: {
          android: "preview-android-base",
          ios: "preview-ios-base",
        },
        projectDirectory,
        runReadOnly: mockTransport({ buildVersions: "malformed" }).runReadOnly,
      }),
    ).rejects.toThrow("version metadata is malformed")
  })
})
