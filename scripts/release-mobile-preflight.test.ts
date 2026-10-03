import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { readFileSync, realpathSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { EwaTradeProviderBundle } from "../.release/ewatrade-provider-bundle"
import { MOBILE_TARGET } from "../.release/ewatrade-provider-bundle"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { assertCompatibleMobileBaseline } from "./release-mobile-preflight"
import { assertReleaseRevision, dirtyReleaseInputs } from "./release-source"

const fixtureRoots: string[] = []
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dir, "../release.manifest.json"), "utf8"),
) as ReleaseManifest

afterEach(async () => {
  await Promise.all(
    fixtureRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function createRepository() {
  const repository = await mkdtemp(
    path.join(tmpdir(), "ewatrade-mobile-preflight-"),
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
  const appConfig = path.join(repository, "apps/mobile/app.config.ts")
  await mkdir(path.dirname(appConfig), { recursive: true })
  await writeFile(appConfig, 'export const UPDATE_VERSION = "2026.09.22"\n')
  execFileSync("git", ["add", "apps/mobile/app.config.ts"], { cwd: repository })
  execFileSync("git", ["commit", "-m", "baseline"], {
    cwd: repository,
    stdio: "ignore",
  })
  const baselineRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repository,
    encoding: "utf8",
  }).trim()
  execFileSync("git", ["commit", "--allow-empty", "-m", "current"], {
    cwd: repository,
    stdio: "ignore",
  })
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repository,
    encoding: "utf8",
  }).trim()
  return { repository, baselineRevision, revision, appConfig }
}

function providerBundle({
  environment = "preview",
  baselineRevision,
  missingIos = false,
  platformOverride,
  channelOverride,
  runtimeOverride,
  revisionOverride,
}: {
  environment?: "preview" | "production"
  baselineRevision: string
  missingIos?: boolean
  platformOverride?: "android" | "ios"
  channelOverride?: string
  runtimeOverride?: string
  revisionOverride?: string
}) {
  const selected = MOBILE_TARGET[environment]
  const fingerprints = { android: "a".repeat(64), ios: "b".repeat(64) }
  const runtimes = { android: "1.0.0", ios: "1.0.0" }
  const builds = (["android", "ios"] as const)
    .filter((platform) => !(missingIos && platform === "ios"))
    .map((platform) => ({
      id: `${platform}-baseline`,
      projectId: MOBILE_TARGET.projectId,
      platform:
        platformOverride && platform === "android"
          ? platformOverride
          : platform,
      profile: selected.profile,
      channel: selected.channel,
      revision: revisionOverride ?? baselineRevision,
      runtimeVersion:
        runtimeOverride && platform === "ios"
          ? runtimeOverride
          : runtimes[platform],
      fingerprint: fingerprints[platform],
      status: "finished" as const,
      availability: "available" as const,
    }))
  return {
    expo: {
      fingerprints,
      runtimeVersions: runtimes,
      baselineBuildIds: { android: "android-baseline", ios: "ios-baseline" },
      newBuildIds: {},
      updateGroupIds: {},
      builds,
      updates: [],
      channels: [
        {
          projectId: MOBILE_TARGET.projectId,
          channel: channelOverride ?? selected.channel,
          branch: selected.branch,
        },
      ],
    },
  } as unknown as EwaTradeProviderBundle
}

test("accepts an exact current revision with compatible Android and iOS baselines", async () => {
  const fixture = await createRepository()
  const bundle = providerBundle(fixture)
  const result = assertCompatibleMobileBaseline(
    { ...fixture, environment: "preview", platforms: ["android", "ios"] },
    bundle,
    manifest,
  )
  expect(result).toEqual({
    revision: fixture.revision,
    environment: "preview",
    platforms: ["android", "ios"],
  })
})

test("accepts the installed Expo fingerprinter's raw SHA-1 form", async () => {
  const fixture = await createRepository()
  const bundle = providerBundle(fixture)
  bundle.expo.fingerprints.android = "a".repeat(40)
  const androidBuild = bundle.expo.builds.find(
    (build) => build.platform === "android",
  )
  if (!androidBuild) throw new Error("Android fixture baseline is missing")
  androidBuild.fingerprint = "a".repeat(40)
  const result = assertCompatibleMobileBaseline(
    { ...fixture, environment: "preview", platforms: ["android"] },
    bundle,
    manifest,
  )
  expect(result.platforms).toEqual(["android"])
})

test("rejects an incorrect channel, platform, and runtime baseline", async () => {
  const fixture = await createRepository()
  expect(() =>
    assertCompatibleMobileBaseline(
      { ...fixture, environment: "preview", platforms: ["android"] },
      providerBundle({ ...fixture, channelOverride: "production" }),
      manifest,
    ),
  ).toThrow("channel")
  expect(() =>
    assertCompatibleMobileBaseline(
      { ...fixture, environment: "preview", platforms: ["android"] },
      providerBundle({ ...fixture, platformOverride: "ios" }),
      manifest,
    ),
  ).toThrow("baseline build is unavailable")
  expect(() =>
    assertCompatibleMobileBaseline(
      { ...fixture, environment: "preview", platforms: ["ios"] },
      providerBundle({ ...fixture, runtimeOverride: "9.9.9" }),
      manifest,
    ),
  ).toThrow("runtime changed")
})

test("rejects missing iOS evidence and a baseline outside current Git ancestry", async () => {
  const fixture = await createRepository()
  expect(() =>
    assertCompatibleMobileBaseline(
      { ...fixture, environment: "preview", platforms: ["android", "ios"] },
      providerBundle({ ...fixture, missingIos: true }),
      manifest,
    ),
  ).toThrow("ios: compatible baseline build is unavailable")
  expect(() =>
    assertCompatibleMobileBaseline(
      { ...fixture, environment: "preview", platforms: ["android"] },
      providerBundle({ ...fixture, revisionOverride: "f".repeat(40) }),
      manifest,
    ),
  ).toThrow("baseline source history is unavailable")
})

test("requires the exact full checked-out revision before publishing", async () => {
  const fixture = await createRepository()
  expect(assertReleaseRevision(fixture.repository, fixture.revision)).toBe(
    realpathSync(fixture.repository),
  )
  expect(() =>
    assertReleaseRevision(fixture.repository, fixture.baselineRevision),
  ).toThrow("exact repository root and full checked-out revision")
  expect(() =>
    assertReleaseRevision(fixture.repository, fixture.revision.slice(0, 12)),
  ).toThrow("exact repository root and full checked-out revision")
})

test("rejects native-candidate changes and detects dirty mobile release inputs", async () => {
  const fixture = await createRepository()
  await writeFile(
    fixture.appConfig,
    'export const UPDATE_VERSION = "2026.10.02"\n',
  )
  execFileSync("git", ["add", "apps/mobile/app.config.ts"], {
    cwd: fixture.repository,
  })
  execFileSync("git", ["commit", "-m", "native candidate changed"], {
    cwd: fixture.repository,
    stdio: "ignore",
  })
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixture.repository,
    encoding: "utf8",
  }).trim()
  const bundle = providerBundle({
    ...fixture,
    baselineRevision: fixture.baselineRevision,
  })
  expect(() =>
    assertCompatibleMobileBaseline(
      { ...fixture, revision, environment: "preview", platforms: ["android"] },
      bundle,
      manifest,
    ),
  ).toThrow("native candidate inputs changed")

  await writeFile(
    fixture.appConfig,
    'export const UPDATE_VERSION = "2026.10.03"\n',
  )
  expect(
    dirtyReleaseInputs(fixture.repository, {
      ...manifest,
      targets: manifest.targets.filter((target) => target.id === "mobile"),
    }),
  ).toContain("apps/mobile/app.config.ts")
  expect(await readFile(fixture.appConfig, "utf8")).toContain("2026.10.03")

  const untrackedMobileInput = path.join(
    fixture.repository,
    "apps/mobile/release-input.ts",
  )
  await writeFile(untrackedMobileInput, "export const candidate = true\n")
  const scopedDirtyInputs = dirtyReleaseInputs(fixture.repository, {
    ...manifest,
    targets: manifest.targets.filter((target) => target.id === "mobile"),
  })
  expect(scopedDirtyInputs).toContain("apps/mobile/app.config.ts")
  expect(scopedDirtyInputs).toContain("apps/mobile/release-input.ts")
})
