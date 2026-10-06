import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { MOBILE_PROJECT } from "../.release/ewatrade-provider-bundle"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import {
  NATIVE_ENVIRONMENT_KEYS,
  type NativeEnvironmentBinding,
  emptyNativeEnvironmentValues,
  resolveNativeEnvironment,
} from "./release-mobile-environment"
import { resolveWorkflow } from "./release-mobile-snapshot"
import {
  type CandidateSandboxContext,
  type IsolatedCandidateExecutor,
  buildCandidateSandboxProfile,
  generateMobileSourceState,
  isCertifiedMobileSourceState,
  safeCandidateEnvironment,
} from "./release-mobile-source"
import { committedSourceFingerprints } from "./release-source"

const fixtureRoots: string[] = []
const toolchainRepository = path.resolve(import.meta.dir, "..")

afterEach(async () => {
  await Promise.all(
    fixtureRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function createRepository(configSource?: string) {
  const repository = await mkdtemp(
    path.join(tmpdir(), "ewatrade-mobile-source-"),
  )
  fixtureRoots.push(repository)
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repository,
    stdio: "ignore",
  })
  execFileSync("git", ["config", "user.name", "Release Fixture"], {
    cwd: repository,
  })
  execFileSync("git", ["config", "user.email", "fixture@example.test"], {
    cwd: repository,
  })
  const appRoot = path.join(repository, "apps/mobile")
  await mkdir(path.join(appRoot, "src"), { recursive: true })
  await writeFile(
    path.join(appRoot, "app.config.ts"),
    configSource ??
      [
        'import { readFileSync } from "node:fs"',
        'import { spawnSync } from "node:child_process"',
        "// Malicious source stays inert unless the isolation probe succeeds.",
        'export default { readHost: () => readFileSync("/etc/passwd"), spawnShell: () => spawnSync("/bin/sh") }',
        "",
      ].join("\n"),
  )
  await writeFile(
    path.join(appRoot, "eas.json"),
    JSON.stringify({
      build: {
        preview: { environment: "preview", channel: "preview" },
        production: { environment: "production", channel: "production" },
      },
    }),
  )
  await writeFile(
    path.join(appRoot, "package.json"),
    await readFile(path.join(toolchainRepository, "apps/mobile/package.json")),
  )
  await writeFile(
    path.join(appRoot, "src/main.ts"),
    "export const current = true\n",
  )
  await writeFile(
    path.join(repository, "package.json"),
    await readFile(path.join(toolchainRepository, "package.json")),
  )
  await writeFile(
    path.join(repository, "bun.lock"),
    await readFile(path.join(toolchainRepository, "bun.lock")),
  )
  await writeFile(
    path.join(repository, "release.manifest.json"),
    await readFile(
      path.join(toolchainRepository, "release.manifest.json"),
      "utf8",
    ),
  )
  execFileSync("git", ["add", "."], { cwd: repository })
  execFileSync("git", ["commit", "-m", "exact mobile source"], {
    cwd: repository,
    stdio: "ignore",
  })
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repository,
    encoding: "utf8",
  }).trim()
  return {
    repository,
    revision,
    appConfig: path.join(appRoot, "app.config.ts"),
  }
}

function mockExecutor(options: { failProbe?: boolean } = {}) {
  const commands: Array<{
    label: string
    args: string[]
    cwd: string
    env: NodeJS.ProcessEnv
    profile: string
    source: string
  }> = []
  const executor: IsolatedCandidateExecutor = {
    async probe(context) {
      expect(context.profile).toContain("(deny default)")
      expect(context.profile).toContain("(deny network-outbound)")
      expect(context.profile).toContain("(deny network-inbound)")
      expect(context.profile).toContain("(allow file-read*")
      expect(context.environment.EXPO_TOKEN).toBeUndefined()
      if (options.failProbe)
        throw new Error("OS sandbox did not prove host-file/process isolation")
    },
    async execute(command, context) {
      commands.push({
        label: command.label,
        args: command.args,
        cwd: context.projectRoot,
        env: context.environment,
        profile: context.profile,
        source: await readFile(
          path.join(context.projectRoot, "app.config.ts"),
          "utf8",
        ),
      })
      if (command.label === "expo-config")
        return JSON.stringify({
          owner: MOBILE_PROJECT.owner,
          slug: MOBILE_PROJECT.slug,
          extra: { eas: { projectId: MOBILE_PROJECT.projectId } },
          version: "1.0.0",
          runtimeVersion: { policy: "appVersion" },
        })
      if (command.label.startsWith("expo-runtime-"))
        return JSON.stringify({
          runtimeVersion: "1.0.0",
          workflow: "managed",
          fingerprintSources: null,
        })
      const platform = command.label.endsWith("android") ? "android" : "ios"
      const hash = platform === "android" ? "a".repeat(40) : "b".repeat(64)
      return JSON.stringify({
        hash,
        sources: [
          "expoConfig",
          "package:react-native",
          `expoAutolinkingConfig:${platform}`,
          `rncoreAutolinkingConfig:${platform}`,
        ].map((id) => ({ type: "contents", id, hash })),
      })
    },
  }
  return { executor, commands }
}

test("generates independent raw Android/iOS hashes from the exact clean Git revision", async () => {
  const fixture = await createRepository()
  const { executor, commands } = mockExecutor()
  const inheritedToken = process.env.EXPO_TOKEN
  process.env.EXPO_TOKEN = "must-not-enter-candidate-environment"
  try {
    const state = await generateMobileSourceState({
      ...fixture,
      environment: "preview",
      executor,
      toolchainRepository,
    })
    expect(state).toMatchObject({
      version: 1,
      revision: fixture.revision,
      environment: "preview",
      nativeConfiguration: {
        appVersion: "1.0.0",
        runtimePolicies: { android: "appVersion", ios: "appVersion" },
      },
      platforms: {
        android: {
          fingerprint: "a".repeat(40),
          fingerprintAlgorithm: "sha1",
          runtimeVersion: "1.0.0",
        },
        ios: {
          fingerprint: "b".repeat(64),
          fingerprintAlgorithm: "sha256",
          runtimeVersion: "1.0.0",
        },
      },
    })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.platforms.android)).toBe(true)
    expect(Object.isFrozen(state.nativeEnvironment.keys)).toBe(true)
    expect(state.nativeEnvironment).toEqual(
      resolveNativeEnvironment(
        {
          revision: fixture.revision,
          environment: "preview",
          sourceFingerprint: state.sourceFingerprint,
        },
        {},
      ).state,
    )
    expect(Object.isFrozen(state.nativeConfiguration.runtimePolicies)).toBe(
      true,
    )
    expect(isCertifiedMobileSourceState(state)).toBe(false)
    expect(
      isCertifiedMobileSourceState(JSON.parse(JSON.stringify(state))),
    ).toBe(false)
    expect(state.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(commands.map((command) => command.label)).toEqual([
      "expo-config",
      "expo-fingerprint-android",
      "expo-runtime-android",
      "expo-fingerprint-ios",
      "expo-runtime-ios",
    ])
    expect(commands[0]?.args.slice(-2)).toEqual(["config", "--json"])
    expect(
      commands.slice(1).map((command) => ({
        platform: command.args[command.args.indexOf("--platform") + 1],
        workflow: command.args[command.args.indexOf("--workflow") + 1],
      })),
    ).toEqual([
      { platform: "android", workflow: "managed" },
      { platform: "android", workflow: "managed" },
      { platform: "ios", workflow: "managed" },
      { platform: "ios", workflow: "managed" },
    ])
    for (const command of commands) {
      expect(command.env.EXPO_TOKEN).toBeUndefined()
      expect(command.env.HOME).not.toBe(process.env.HOME)
      expect(command.env.EXPO_NO_DOTENV).toBe("1")
      expect(command.env.APP_VARIANT).toBe("preview")
      expect(command.source).toContain('readFileSync("/etc/passwd")')
      expect(command.profile).toContain("(deny network-outbound)")
    }
  } finally {
    if (inheritedToken === undefined) process.env.EXPO_TOKEN = undefined
    else process.env.EXPO_TOKEN = inheritedToken
  }
})

test("refuses a stale revision or dirty mobile input before calling candidate tools", async () => {
  const fixture = await createRepository()
  const { executor, commands } = mockExecutor()
  await expect(
    generateMobileSourceState({
      ...fixture,
      revision: "d".repeat(40),
      environment: "preview",
      executor,
      toolchainRepository,
    }),
  ).rejects.toThrow("exact repository root and full checked-out revision")
  await writeFile(fixture.appConfig, "export default {}\n")
  await expect(
    generateMobileSourceState({
      ...fixture,
      environment: "preview",
      executor,
      toolchainRepository,
    }),
  ).rejects.toThrow("changed mobile release inputs")
  expect(commands).toEqual([])
})

test("classifies committed native workflow independently for each platform", async () => {
  const fixture = await createRepository()
  const project = path.join(
    fixture.repository,
    "apps/mobile/ios/EwaTrade.xcodeproj",
  )
  await mkdir(project, { recursive: true })
  await writeFile(path.join(project, "project.pbxproj"), "reviewed fixture\n")
  execFileSync("git", ["add", "."], { cwd: fixture.repository })
  execFileSync("git", ["commit", "-qm", "ios native project"], {
    cwd: fixture.repository,
  })
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixture.repository,
    encoding: "utf8",
  }).trim()
  expect(resolveWorkflow(fixture.repository, revision, "android")).toBe(
    "managed",
  )
  expect(resolveWorkflow(fixture.repository, revision, "ios")).toBe("generic")
})

test("refuses native config that depends on environment values without trusted bindings", async () => {
  const fixture = await createRepository(
    "export default { value: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID }\n",
  )
  const { executor, commands } = mockExecutor()
  await expect(
    generateMobileSourceState({
      ...fixture,
      environment: "production",
      executor,
      toolchainRepository,
    }),
  ).rejects.toThrow("unapproved or indirect environment access")
  expect(commands).toEqual([])
})

test("fails closed if OS isolation cannot be proved and never executes malicious config", async () => {
  const fixture = await createRepository()
  const { executor, commands } = mockExecutor({ failProbe: true })
  await expect(
    generateMobileSourceState({
      ...fixture,
      environment: "production",
      executor,
      toolchainRepository,
    }),
  ).rejects.toThrow("OS sandbox did not prove")
  expect(commands).toEqual([])
})

test("sandbox policy denies network, host-file access, and unapproved process execution", () => {
  const context: CandidateSandboxContext = {
    snapshotRoot: "/tmp/snapshot",
    projectRoot: "/tmp/snapshot/apps/mobile",
    home: "/tmp/private-home",
    temp: "/tmp/private-tmp",
    dependencyStore: "/trusted/node_modules/.bun",
    nodeBinary: "/trusted/bin/node",
    gitBinary: "/usr/bin/git",
    runtimeLibraries: ["/trusted/lib/libnode.dylib"],
    environment: safeCandidateEnvironment(
      "preview",
      "/tmp/private-home",
      "/tmp/private-tmp",
    ),
    profile: "",
  }
  const profile = buildCandidateSandboxProfile(context)
  expect(profile).toContain("(deny default)")
  expect(profile).toContain("(deny network-outbound)")
  expect(profile).toContain("(deny network-inbound)")
  expect(profile).toContain('(literal "/trusted/bin/node")')
  expect(profile).toContain('(literal "/usr/bin/git")')
  expect(profile).toContain('(literal "/trusted/lib/libnode.dylib")')
  expect(profile).not.toContain('(literal "/bin/sh")')
  expect(profile).not.toContain('(subpath "/Users/M1PRO")')
  expect(profile).not.toContain("(allow process-exec (regex")
  expect(profile).not.toContain('(allow file-write* (subpath "/tmp/snapshot")')
})

test("injects only protected reviewed native values and emits hashes instead of values", async () => {
  const fixture = await createRepository(
    `export default { values: [${NATIVE_ENVIRONMENT_KEYS.map((key) => `process.env.${key}`).join(",")}]}\n`,
  )
  const manifest = JSON.parse(
    readFileSync(
      path.join(fixture.repository, "release.manifest.json"),
      "utf8",
    ),
  ) as ReleaseManifest
  const sourceFingerprint = committedSourceFingerprints(
    fixture.repository,
    fixture.revision,
    manifest,
  ).mobile
  const binding: NativeEnvironmentBinding = {
    version: 1,
    projectId: MOBILE_PROJECT.projectId,
    revision: fixture.revision,
    environment: "preview",
    sourceFingerprint,
    reviewedBy: "owned source test reviewer",
    reviewedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    values: {
      ...emptyNativeEnvironmentValues(),
      EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND: "false",
      EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS: "60000",
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
        "123-reviewed.apps.googleusercontent.com",
      EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat-preview.example.test",
    },
  }
  const json = JSON.stringify(binding)
  const configuration = {
    EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: json,
    EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: createHash("sha256")
      .update(json)
      .digest("hex"),
    EXPO_TOKEN: "must-not-enter",
    NODE_OPTIONS: "must-not-enter",
  }
  const { executor, commands } = mockExecutor()
  const state = await generateMobileSourceState({
    ...fixture,
    environment: "preview",
    executor,
    toolchainRepository,
    nativeEnvironmentConfiguration: configuration,
  })
  expect(commands).toHaveLength(5)
  for (const command of commands) {
    expect(command.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID).toBe(
      binding.values.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? undefined,
    )
    expect(command.env.GOOGLE_IOS_CLIENT_ID).toBeUndefined()
    expect(command.env.EXPO_PUBLIC_CUSTOMER_CHAT_HOST).toBe(
      binding.values.EXPO_PUBLIC_CUSTOMER_CHAT_HOST ?? undefined,
    )
    expect(command.env.EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND).toBe("false")
    expect(command.env.NODE_OPTIONS).toBeUndefined()
    expect(command.env.EXPO_TOKEN).toBeUndefined()
    expect(command.env.EXPO_NO_DOTENV).toBe("1")
  }
  expect(state.nativeEnvironment.bindingFingerprint).toBe(
    configuration.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256,
  )
  expect(JSON.stringify(state)).not.toContain("123-reviewed")
  expect(JSON.stringify(state)).not.toContain("chat-preview.example.test")
  expect(isCertifiedMobileSourceState(state)).toBe(false)
  const failed = mockExecutor()
  await expect(
    generateMobileSourceState({
      ...fixture,
      environment: "preview",
      executor: failed.executor,
      toolchainRepository,
      nativeEnvironmentConfiguration: {
        ...configuration,
        EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: "f".repeat(64),
      },
    }),
  ).rejects.toThrow("bytes/digest")
  expect(failed.commands).toHaveLength(0)
})

test("AST source guard refuses process aliases before candidate execution", async () => {
  for (const source of [
    "const p = process; export default { value: p.env.EXPO_TOKEN }",
    'import p from "node:process"; export default { value: p.env.EXPO_TOKEN }',
  ]) {
    const fixture = await createRepository(source)
    const { executor, commands } = mockExecutor()
    await expect(
      generateMobileSourceState({
        ...fixture,
        environment: "preview",
        executor,
        toolchainRepository,
      }),
    ).rejects.toThrow()
    expect(commands).toHaveLength(0)
  }
})

test("source generation refuses committed native profile overrides of explicit absent values", async () => {
  const fixture = await createRepository()
  await writeFile(
    path.join(fixture.repository, "apps/mobile/eas.json"),
    JSON.stringify({
      build: {
        preview: {
          environment: "preview",
          channel: "preview",
          env: { EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "different.example.com" },
        },
      },
    }),
  )
  execFileSync("git", ["add", "."], { cwd: fixture.repository })
  execFileSync("git", ["commit", "-m", "conflicting native profile"], {
    cwd: fixture.repository,
    stdio: "ignore",
  })
  fixture.revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixture.repository,
    encoding: "utf8",
  }).trim()
  const { executor, commands } = mockExecutor()
  await expect(
    generateMobileSourceState({
      ...fixture,
      environment: "preview",
      executor,
      toolchainRepository,
    }),
  ).rejects.toThrow("protected native environment")
  expect(commands).toHaveLength(0)
})
