import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import {
  type ReleaseCollectionAdapters,
  collectReleaseFacts,
} from "./release-collect"
import type { ExpoSourceState } from "./release-expo-collect"
import { resolveNativeEnvironment } from "./release-mobile-environment"
import type { TriggerCollection } from "./release-trigger-collect"
import type { VercelCollection } from "./release-vercel-collect"

const root = resolve(import.meta.dir, "..")
const fixtures: string[] = []

function vercelCollection(
  environment: "preview" | "production",
): VercelCollection {
  return {
    provider: "vercel",
    environment,
    observedAt: new Date().toISOString(),
    projects: [],
    deploymentIds: {},
    deployments: [],
    aliases: [],
    deploymentLifecycles: [],
    blockers: [
      { targetId: "api-web", reason: "promotion-assignment-time-unverified" },
    ],
    releaseReady: false,
  }
}

function triggerCollection(
  environment: "preview" | "production",
  revision: string,
): TriggerCollection {
  return {
    provider: "trigger",
    environment,
    revision,
    observedAt: new Date().toISOString(),
    project: null,
    environmentIdentity: null,
    currentWorker: null,
    activeDeployment: null,
    blockers: [{ targetId: "jobs", reason: "source-attribution-unavailable" }],
    releaseReady: false,
  }
}

function fixture() {
  const repository = realpathSync(
    mkdtempSync(join(tmpdir(), "ewatrade-release-collect-")),
  )
  fixtures.push(repository)
  mkdirSync(join(repository, ".release"), { recursive: true })
  for (const path of [
    "release.manifest.json",
    ".release/policy.json",
    ".release/toolkit.lock.json",
  ])
    writeFileSync(join(repository, path), readFileSync(join(root, path)))
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  git("init", "-q")
  git("config", "user.name", "Release Collect Test")
  git("config", "user.email", "release-collect@example.test")
  git("add", ".")
  git("commit", "-qm", "trusted release input fixture")
  return { repository, git, revision: git("rev-parse", "HEAD") }
}

afterEach(() => {
  for (const repository of fixtures.splice(0))
    rmSync(repository, { recursive: true, force: true })
})

const inertAdapters = (
  calls: string[],
  revision: string,
  environment: "preview" | "production" = "production",
): ReleaseCollectionAdapters => ({
  vercel: async () => {
    calls.push("vercel")
    return vercelCollection(environment)
  },
  trigger: async () => {
    calls.push("trigger")
    return triggerCollection(environment, revision)
  },
})

test("preflights trusted Git and collects only injected unsigned app/provider facts", async () => {
  const { repository, revision } = fixture()
  const calls: string[] = []
  const adapters = inertAdapters(calls, revision)
  const report = await collectReleaseFacts({
    repository,
    revision,
    environment: "production",
    expectedTriggerOrganizationId: "org_fixture",
    adapters,
  })
  expect(calls).toEqual(["vercel", "trigger"])
  expect(report.fragments.vercelSource).toHaveLength(3)
  expect(
    report.fragments.vercelSource.every(
      (item) => !item.compatible && item.candidateRevision === revision,
    ),
  ).toBe(true)
  for (const target of WEB_TARGETS)
    expect(report.blockers).toContainEqual({
      targetId: target.targetId,
      reason: "provider-deployment-binding-invalid",
    })
  expect(report).toMatchObject({
    version: 1,
    project: "ewatrade",
    revision,
    environment: "production",
    releaseReady: false,
    fragments: {
      mobile: {
        sourceStateBound: false,
        provenanceVerified: false,
        blockers: ["credential-free-mobile-source-state-unavailable"],
      },
    },
  })
  expect(report).not.toHaveProperty("fragments.database")
  expect(report).not.toHaveProperty("fragments.databaseOperation")
  expect(report.blockers.some((item) => item.targetId === "database")).toBe(
    false,
  )
  expect(Object.keys(report.sourceHashes).sort()).toEqual([
    "api-web",
    "dashboard-web",
    "jobs",
    "marketing-web",
    "mobile",
  ])
  expect(report.contract.toolkitRevision).toMatch(/^[0-9a-f]{40}$/)
  expect(report.contract.policyFingerprint).toMatch(/^[0-9a-f]{64}$/)
  expect(report.blockers).toContainEqual({
    targetId: "api-web",
    reason: "promotion-assignment-time-unverified",
  })
  expect(report.blockers).toContainEqual({
    targetId: "jobs",
    reason: "source-attribution-unavailable",
  })
})

test("bad full revision and weakened committed topology fail before provider stage", async () => {
  const { repository, revision, git } = fixture()
  const calls: string[] = []
  await expect(
    collectReleaseFacts({
      repository,
      revision: revision.slice(0, 12),
      environment: "preview",
      adapters: inertAdapters(calls, revision),
    }),
  ).rejects.toThrow("exact repository root and full checked-out revision")
  expect(calls).toEqual([])

  const manifest = JSON.parse(
    readFileSync(join(repository, "release.manifest.json"), "utf8"),
  )
  manifest.targets = manifest.targets.filter(
    (target: { id: string }) => target.id !== "jobs",
  )
  writeFileSync(
    join(repository, "release.manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  git("add", "release.manifest.json")
  git("commit", "-qm", "weaken target topology")
  const weakenedRevision = git("rev-parse", "HEAD")
  await expect(
    collectReleaseFacts({
      repository,
      revision: weakenedRevision,
      environment: "preview",
      adapters: inertAdapters(calls, weakenedRevision),
    }),
  ).rejects.toThrow(
    "Candidate release topology weakens trusted requirements for jobs",
  )
  expect(calls).toEqual([])
})

test("dirty candidate source and config block all authenticated collection", async () => {
  const { repository, revision } = fixture()
  writeFileSync(join(repository, "release.manifest.json"), "{}\n")
  const calls: string[] = []
  await expect(
    collectReleaseFacts({
      repository,
      revision,
      environment: "production",
      adapters: inertAdapters(calls, revision),
    }),
  ).rejects.toThrow("manifest differs from the committed revision")
  expect(calls).toEqual([])
})

for (const file of [".release/policy.json", ".release/toolkit.lock.json"]) {
  test(`rejects a committed change to untrusted ${file} before provider reads`, async () => {
    const { repository, git } = fixture()
    writeFileSync(join(repository, file), "{}\n")
    git("add", file)
    git("commit", "-qm", "untrusted policy declaration")
    const revision = git("rev-parse", "HEAD")
    const calls: string[] = []
    await expect(
      collectReleaseFacts({
        repository,
        revision,
        environment: "production",
        adapters: inertAdapters(calls, revision),
      }),
    ).rejects.toThrow("policy or toolkit binding is untrusted")
    expect(calls).toEqual([])
  })
}

test("rejects provider fragments bound to the other environment or revision", async () => {
  const { repository, revision } = fixture()
  const calls: string[] = []
  const adapters = inertAdapters(calls, "f".repeat(40), "preview")
  const report = await collectReleaseFacts({
    repository,
    revision,
    environment: "production",
    expectedTriggerOrganizationId: "org_fixture",
    adapters,
  })
  expect(report.fragments.vercel).toBeNull()
  expect(report.fragments.trigger).toBeNull()
  for (const [targetId, reason] of [
    ["web", "vercel-fact-collection-failed"],
    ["jobs", "trigger-fact-collection-failed"],
  ])
    expect(report.blockers).toContainEqual({ targetId, reason })
  expect(report.releaseReady).toBe(false)
})

test("orchestration carries unchanged ancestor source bindings and blocks changed dependencies", async () => {
  const { repository, revision: deployed, git } = fixture()
  const collection = vercelCollection("preview")
  const roots: Record<string, string> = {
    "dashboard-web": "apps/dashboard",
    "api-web": "apps/api",
    "marketing-web": "apps/marketing",
  }
  for (const target of WEB_TARGETS) {
    const id = `dpl_${target.targetId.replaceAll("-", "_")}`
    collection.projects.push({
      targetId: target.targetId,
      projectId: target.projectId,
      teamId: target.teamId ?? "",
      rootDirectory: roots[target.targetId],
    })
    collection.deploymentIds[target.targetId] = id
    collection.deployments.push({
      id,
      projectId: target.projectId,
      readyState: "READY",
      target: null,
      url: "owned.vercel.app",
      gitSource: { sha: deployed },
    })
  }
  collection.blockers = []
  writeFileSync(join(repository, "README.md"), "unrelated documentation\n")
  git("add", ".")
  git("commit", "-qm", "documentation")
  const collect = async () => {
    const revision = git("rev-parse", "HEAD")
    const adapters = inertAdapters([], revision, "preview")
    adapters.vercel = async () => collection
    return collectReleaseFacts({
      repository,
      revision,
      environment: "preview",
      expectedTriggerOrganizationId: "org_fixture",
      adapters,
    })
  }
  const unchanged = await collect()
  expect(
    unchanged.fragments.vercelSource.every(
      (item) =>
        item.compatible &&
        item.candidateRevision === unchanged.revision &&
        item.providerRevision === deployed &&
        item.candidateSourceFingerprint ===
          unchanged.sourceHashes[item.targetId],
    ),
  ).toBe(true)
  expect(unchanged.releaseReady).toBe(false)
  mkdirSync(join(repository, "apps/api"), { recursive: true })
  writeFileSync(
    join(repository, "apps/api/index.ts"),
    "export const changed = true\n",
  )
  git("add", ".")
  git("commit", "-qm", "changed dependency")
  const changed = await collect()
  expect(changed.fragments.vercelSource.every((item) => !item.compatible)).toBe(
    true,
  )
  for (const target of WEB_TARGETS)
    expect(changed.blockers).toContainEqual({
      targetId: target.targetId,
      reason: "provider-target-source-changed",
    })
  expect(changed.releaseReady).toBe(false)
})

test("Trigger adapters receive candidate revision and cannot return another revision or provider", async () => {
  const { repository, revision } = fixture()
  for (const fault of ["revision", "provider"] as const) {
    const adapters = inertAdapters([], revision)
    adapters.trigger = async (input) => {
      expect(input.revision).toBe(revision)
      expect(input.environment).toBe("production")
      const facts = triggerCollection("production", revision)
      if (fault === "revision") facts.revision = "f".repeat(40)
      else Object.assign(facts, { provider: "foreign" })
      return facts
    }
    const report = await collectReleaseFacts({
      repository,
      revision,
      environment: "production",
      expectedTriggerOrganizationId: "org_fixture",
      adapters,
    })
    expect(report.fragments.trigger).toBeNull()
    expect(report.blockers).toContainEqual({
      targetId: "jobs",
      reason: "trigger-fact-collection-failed",
    })
    expect(report.releaseReady).toBe(false)
  }
})

test("Preview deployment IDs invoke the default read-only Vercel collector without network access", async () => {
  const { repository, revision } = fixture()
  const originalFetch = globalThis.fetch
  const originalToken = process.env.VERCEL_TOKEN
  let attempts = 0
  globalThis.fetch = Object.assign(
    async () => {
      attempts += 1
      throw new Error("mocked transport prevents network access")
    },
    { preconnect: originalFetch.preconnect },
  )
  process.env.VERCEL_TOKEN = "mock-only-token"
  const calls: string[] = []
  const adapters = inertAdapters(calls, revision, "preview")
  adapters.vercel = undefined
  try {
    const report = await collectReleaseFacts({
      repository,
      revision,
      environment: "preview",
      expectedTriggerOrganizationId: "org_fixture",
      previewDeploymentIds: Object.fromEntries(
        WEB_TARGETS.map((target) => [
          target.targetId,
          `dpl_${target.targetId}`,
        ]),
      ),
      adapters,
    })
    expect(attempts).toBe(1)
    expect(report.blockers).toContainEqual({
      targetId: "web",
      reason: "vercel-fact-collection-failed",
    })
    expect(report.blockers).not.toContainEqual({
      targetId: "web",
      reason: "preview-deployment-identifiers-required-for-read-only-lookup",
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined)
      Reflect.deleteProperty(process.env, "VERCEL_TOKEN")
    else process.env.VERCEL_TOKEN = originalToken
  }
})

test("Expo source state with a forged revision is reported as a provenance gap, never forwarded", async () => {
  const { repository, revision } = fixture()
  const calls: string[] = []
  const sourceState: ExpoSourceState = {
    version: 1,
    revision: "f".repeat(40),
    environment: "production",
    sourceFingerprint: "a".repeat(64),
    nativeEnvironment: resolveNativeEnvironment(
      {
        revision: "f".repeat(40),
        environment: "production",
        sourceFingerprint: "a".repeat(64),
      },
      {},
    ).state,
    nativeConfiguration: {
      appVersion: "1.0.0",
      runtimePolicies: { android: "appVersion", ios: "appVersion" },
    },
    platforms: {
      android: {
        fingerprint: "b".repeat(64),
        fingerprintAlgorithm: "sha256",
        runtimeVersion: "1.0.0",
      },
      ios: {
        fingerprint: "c".repeat(64),
        fingerprintAlgorithm: "sha256",
        runtimeVersion: "1.0.0",
      },
    },
  }
  const report = await collectReleaseFacts({
    repository,
    revision,
    environment: "production",
    expectedTriggerOrganizationId: "org_fixture",
    mobileSourceState: sourceState,
    adapters: inertAdapters(calls, revision),
  })
  expect(calls).toEqual(["vercel", "trigger"])
  expect(report.fragments.mobile.sourceStateBound).toBe(false)
  expect(report.fragments.mobile.provenanceVerified).toBe(false)
  expect(report.fragments.mobile.blockers).toEqual([
    "mobile-source-state-is-not-bound-to-exact-revision-and-environment",
  ])
  expect(JSON.stringify(report)).not.toContain("b".repeat(64))
})

test("matching Expo source fingerprint remains untrusted without a trusted generator", async () => {
  const { repository, revision } = fixture()
  const calls: string[] = []
  const base = await collectReleaseFacts({
    repository,
    revision,
    environment: "production",
    expectedTriggerOrganizationId: "org_fixture",
    adapters: inertAdapters(calls, revision),
  })
  calls.length = 0
  const sourceState: ExpoSourceState = {
    version: 1,
    revision,
    environment: "production",
    sourceFingerprint: base.sourceHashes.mobile,
    nativeEnvironment: resolveNativeEnvironment(
      {
        revision,
        environment: "production",
        sourceFingerprint: base.sourceHashes.mobile,
      },
      {},
    ).state,
    nativeConfiguration: {
      appVersion: "1.0.0",
      runtimePolicies: { android: "appVersion", ios: "appVersion" },
    },
    platforms: {
      android: {
        fingerprint: "1".repeat(64),
        fingerprintAlgorithm: "sha256",
        runtimeVersion: "1.0.0",
      },
      ios: {
        fingerprint: "2".repeat(64),
        fingerprintAlgorithm: "sha256",
        runtimeVersion: "1.0.0",
      },
    },
  }
  const report = await collectReleaseFacts({
    repository,
    revision,
    environment: "production",
    expectedTriggerOrganizationId: "org_fixture",
    mobileSourceState: sourceState,
    expoBaselineBuildIds: { android: "build_android", ios: "build_ios" },
    adapters: {
      ...inertAdapters(calls, revision),
      expo: async () => {
        calls.push("expo-must-not-run")
        throw new Error("Untrusted source state reached authenticated Expo")
      },
    },
  })
  expect(report.fragments.mobile.sourceStateBound).toBe(true)
  expect(report.fragments.mobile.provenanceVerified).toBe(false)
  expect(report.fragments.mobile.blockers).toEqual([
    "mobile-source-state-provenance-is-not-authenticated-by-a-trusted-generator",
  ])
  expect(report.releaseReady).toBe(false)
  expect(calls).toEqual(["vercel", "trigger"])
  expect(report.fragments.expo).toBeNull()
})

test("refuses an observation when release inputs change during provider reads", async () => {
  const { repository, revision } = fixture()
  const calls: string[] = []
  const adapters = inertAdapters(calls, revision)
  adapters.vercel = async () => {
    writeFileSync(join(repository, ".release/policy.json"), "{}\n")
    return vercelCollection("production")
  }
  await expect(
    collectReleaseFacts({
      repository,
      revision,
      environment: "production",
      expectedTriggerOrganizationId: "org_fixture",
      adapters,
    }),
  ).rejects.toThrow("release inputs changed during collection")
})
