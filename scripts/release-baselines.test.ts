import { afterEach, expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  type EwaTradeProviderBundle,
  JOBS_TARGET,
  MOBILE_TARGET,
  WEB_TARGETS,
} from "../.release/ewatrade-provider-bundle"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import {
  refreshReleaseBaselines,
  verifyAndRefreshReleaseBaselines,
} from "./release-baselines"
import { releaseContract } from "./release-contract"
import { compareExpoNativeEnvironment } from "./release-expo-environment"
import { resolveNativeEnvironment } from "./release-mobile-environment"
import { mobileNativeDigest } from "./release-mobile-fingerprint"
import { committedSourceFingerprints, releaseGit } from "./release-source"
import { verifyCandidateReleaseProof } from "./release-verify"

const root = resolve(import.meta.dir, "..")
const secret = "release-baselines-test-secret-at-least-32-bytes"
const priorEnvironment = {
  envelope: process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE,
  key: process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY,
}
const repositories: string[] = []

function git(repository: string, ...args: string[]) {
  return releaseGit(repository, ["-c", "core.hooksPath=/dev/null", ...args])
}

function fixture() {
  const repository = mkdtempSync(join(tmpdir(), "ewatrade-release-baselines-"))
  repositories.push(repository)
  git(repository, "init", "-q", "--initial-branch=main")
  git(repository, "config", "user.name", "Release Baselines Test")
  git(repository, "config", "user.email", "release-baselines@example.invalid")
  writeFileSync(
    join(repository, "release.manifest.json"),
    readFileSync(resolve(root, "release.manifest.json")),
  )
  writeFileSync(join(repository, "package.json"), '{"name":"fixture"}\n')
  mkdirSync(
    join(repository, "packages/db/prisma/migrations/20261002000000_fixture"),
    { recursive: true },
  )
  writeFileSync(
    join(repository, "packages/db/prisma/schema.prisma"),
    "// baseline fixture schema\nmodel Fixture {\n id String @id\n}\n",
  )
  writeFileSync(
    join(
      repository,
      "packages/db/prisma/migrations/20261002000000_fixture/migration.sql",
    ),
    "CREATE TABLE fixture (id text PRIMARY KEY);\n",
  )
  for (const path of [
    "apps/api/src/trpc/routers/_app.ts",
    "apps/dashboard/src/verifier-fixture.ts",
    "apps/marketing/src/verifier-fixture.ts",
    "apps/mobile/src/verifier-fixture.ts",
    "apps/mobile/app.config.ts",
    "packages/jobs/src/verifier-fixture.ts",
  ]) {
    const file = join(repository, path)
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, "// inert release fixture\n")
  }
  mkdirSync(join(repository, ".release"), { recursive: true })
  writeFileSync(
    join(repository, "apps/mobile/eas.json"),
    JSON.stringify({
      build: {
        preview: { environment: "preview", channel: "preview" },
        production: { environment: "production", channel: "production" },
      },
    }),
  )
  git(repository, "add", ".")
  git(repository, "commit", "-qm", "baseline verifier fixture")
  return {
    repository: realpathSync(repository),
    revision: git(repository, "rev-parse", "HEAD"),
  }
}

function envelope(bundle: unknown) {
  const payload = Buffer.from(JSON.stringify(bundle)).toString("base64url")
  return JSON.stringify({
    version: 1,
    payload,
    signature: createHmac("sha256", secret).update(payload).digest("hex"),
  })
}

function configure(bundle: unknown) {
  process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY = secret
  process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE = envelope(bundle)
}

async function validBundle(repository: string, revision: string) {
  const manifest = JSON.parse(
    readFileSync(join(repository, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  const sourceFingerprints = committedSourceFingerprints(
    repository,
    revision,
    manifest,
  )
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex")
  const now = new Date().toISOString()
  const targetFingerprints = {
    "api-web": { kind: "configuration" as const, value: hash("api") },
    "dashboard-web": {
      kind: "configuration" as const,
      value: hash("dashboard"),
    },
    "marketing-web": {
      kind: "configuration" as const,
      value: hash("marketing"),
    },
    mobile: { kind: "native" as const, value: hash("mobile") },
    jobs: { kind: "configuration" as const, value: hash("jobs") },
  }
  const descriptors = [
    {
      targetId: "api-web",
      targetKind: "web" as const,
      action: "web-deploy" as const,
      provider: "vercel",
    },
    {
      targetId: "dashboard-web",
      targetKind: "web" as const,
      action: "web-deploy" as const,
      provider: "vercel",
    },
    {
      targetId: "marketing-web",
      targetKind: "web" as const,
      action: "web-deploy" as const,
      provider: "vercel",
    },
    {
      targetId: "mobile",
      targetKind: "mobile" as const,
      action: "mobile-build" as const,
      provider: "expo",
    },
    {
      targetId: "jobs",
      targetKind: "jobs" as const,
      action: "jobs-deploy" as const,
      provider: "trigger",
    },
  ]
  const receipts = descriptors.map((descriptor, index) => ({
    version: 1 as const,
    project: "ewatrade",
    ...descriptor,
    environment: "preview" as const,
    revision,
    fingerprint:
      targetFingerprints[
        descriptor.targetId as keyof typeof targetFingerprints
      ],
    deploymentId: `baseline-fixture-${index + 1}`,
    result: "succeeded" as const,
    completedAt: now,
  }))
  const contract = releaseContract(
    root,
    "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7",
  )
  const nativeContext = {
    revision,
    environment: "preview" as const,
    sourceFingerprint: sourceFingerprints.mobile,
  }
  const nativeEnvironment = resolveNativeEnvironment(nativeContext, {}).state
  const nativeEnvironmentParity = compareExpoNativeEnvironment(
    nativeContext,
    nativeEnvironment,
    JSON.parse(readFileSync(join(repository, "apps/mobile/eas.json"), "utf8")),
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
  const bundle = {
    version: 1 as const,
    project: "ewatrade" as const,
    environment: "preview" as const,
    revision,
    generatedAt: now,
    toolkitRevision: contract.toolkitRevision,
    policyFingerprint: contract.policyFingerprint,
    sourceFingerprints,
    receipts,
    evidence: receipts.map(({ version: _version, ...receipt }) => receipt),
    liveState: receipts.map((receipt) => ({
      project: receipt.project,
      targetId: receipt.targetId,
      targetKind: receipt.targetKind,
      environment: receipt.environment,
      revision: receipt.revision,
      provider: receipt.provider,
      deploymentId: receipt.deploymentId,
      fingerprint: receipt.fingerprint,
      active: true,
      observedAt: now,
    })),
    fingerprints: targetFingerprints,
    vercel: {
      deploymentIds: Object.fromEntries(
        WEB_TARGETS.map((target) => [
          target.targetId,
          receipts.find((receipt) => receipt.targetId === target.targetId)
            ?.deploymentId ?? "",
        ]),
      ),
      deployments: WEB_TARGETS.map((target) => ({
        id:
          receipts.find((receipt) => receipt.targetId === target.targetId)
            ?.deploymentId ?? "",
        projectId: target.projectId,
        readyState: "READY",
        target: "preview",
        url: `${target.targetId}.example.test`,
        gitSource: { sha: revision },
      })),
      domains: [],
    },
    expo: {
      nativeEnvironment,
      nativeEnvironmentParity,
      fingerprints: {
        android: targetFingerprints.mobile.value,
        ios: targetFingerprints.mobile.value,
      },
      runtimeVersions: { android: "1", ios: "1" },
      baselineBuildIds: { android: "baseline-android", ios: "baseline-ios" },
      newBuildIds: {},
      updateGroupIds: {},
      builds: (["android", "ios"] as const).map((platform) => ({
        id: `baseline-${platform}`,
        projectId: MOBILE_TARGET.projectId,
        platform,
        profile: MOBILE_TARGET.preview.profile,
        channel: MOBILE_TARGET.preview.channel,
        revision,
        runtimeVersion: "1",
        fingerprint: targetFingerprints.mobile.value,
        status: "finished" as const,
        availability: "available" as const,
      })),
      updates: [],
      channels: [
        {
          projectId: MOBILE_TARGET.projectId,
          channel: MOBILE_TARGET.preview.channel,
          branch: MOBILE_TARGET.preview.branch,
        },
      ],
    },
    jobs: {
      deploymentIds: {
        jobs: receipts.find((receipt) => receipt.targetId === "jobs")
          ?.deploymentId,
      },
      configurationFingerprints: { jobs: targetFingerprints.jobs.value },
      deployments: [
        {
          id:
            receipts.find((receipt) => receipt.targetId === "jobs")
              ?.deploymentId ?? "",
          provider: "trigger",
          projectRef:
            JOBS_TARGET.preview.capability === "isolated"
              ? (JOBS_TARGET.preview.projectRef ?? JOBS_TARGET.projectRef)
              : "",
          providerEnvironment: "prod",
          branch: null,
          revision,
          configurationFingerprint: targetFingerprints.jobs.value,
          version: "fixture-jobs-1",
          status: "deployed" as const,
          current: true,
        },
      ],
    },
  } satisfies EwaTradeProviderBundle
  targetFingerprints.mobile.value = mobileNativeDigest({
    projectId: MOBILE_TARGET.projectId,
    environment: bundle.environment,
    ...MOBILE_TARGET[bundle.environment],
    fingerprints: bundle.expo.fingerprints,
    runtimeVersions: bundle.expo.runtimeVersions,
  })
  return bundle
}

afterEach(() => {
  for (const repository of repositories.splice(0))
    rmSync(repository, { recursive: true, force: true })
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
  restore("EWATRADE_RELEASE_EVIDENCE_ENVELOPE", priorEnvironment.envelope)
  restore("EWATRADE_RELEASE_EVIDENCE_HMAC_KEY", priorEnvironment.key)
})

test("writes verified Preview receipts atomically and preserves Production claims", async () => {
  const { repository, revision } = fixture()
  const output = join(repository, ".release/baselines.json")
  const previous = {
    version: 1,
    project: "ewatrade",
    baselines: { production: { mobile: "d".repeat(40), "api-web": null } },
  }
  writeFileSync(output, `${JSON.stringify(previous)}\n`, { mode: 0o600 })
  configure(await validBundle(repository, revision))
  const proof = await verifyCandidateReleaseProof({
    repository,
    revision,
    environment: "preview",
  })
  expect(proof.report.ready).toBe(true)
  const result = refreshReleaseBaselines({
    repository,
    environment: "preview",
    proof,
  })
  const written = JSON.parse(readFileSync(output, "utf8"))
  expect(written).toMatchObject({
    version: 1,
    project: "ewatrade",
    baselines: {
      production: previous.baselines.production,
      preview: Object.fromEntries(
        proof.evidence.verified.map((receipt) => [
          receipt.targetId,
          receipt.revision,
        ]),
      ),
    },
  })
  expect(result.path).toBe(output)
  expect((await import("node:fs")).statSync(output).mode & 0o777).toBe(0o600)
})

test("rejects missing or unready proof without changing existing bytes", async () => {
  const { repository, revision } = fixture()
  const output = join(repository, ".release/baselines.json")
  const previous =
    '{"version":1,"project":"ewatrade","baselines":{"production":{"api-web":"e"}}}\n'
  writeFileSync(output, previous, { mode: 0o600 })
  expect(() =>
    refreshReleaseBaselines({
      repository,
      environment: "preview",
      proof: {} as never,
    }),
  ).toThrow("genuine strict verifier proof")
  expect(readFileSync(output, "utf8")).toBe(previous)

  const bundle = await validBundle(repository, revision)
  bundle.jobs.deployments = []
  configure(bundle)
  const proof = await verifyCandidateReleaseProof({
    repository,
    revision,
    environment: "preview",
  })
  expect(proof.report.ready).toBe(false)
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "preview", proof }),
  ).toThrow("ready proof")
  expect(readFileSync(output, "utf8")).toBe(previous)
})

test("legacy database proof claims cannot replace missing application evidence", async () => {
  const { repository, revision } = fixture()
  const output = join(repository, ".release/baselines.json")
  const previous = '{"version":1,"project":"ewatrade","baselines":{}}\n'
  writeFileSync(output, previous, { mode: 0o600 })
  const candidate = await validBundle(repository, revision)
  const legacyClaim = {
    ...candidate,
    receipts: candidate.receipts.filter(
      (receipt) => receipt.targetId !== "dashboard-web",
    ),
    evidence: candidate.evidence.filter(
      (receipt) => receipt.targetId !== "dashboard-web",
    ),
    liveState: candidate.liveState.filter(
      (receipt) => receipt.targetId !== "dashboard-web",
    ),
    databaseProof: {
      version: 1,
      strategy: "migrate-deploy",
      releaseReady: true,
    },
  }
  configure(legacyClaim)
  await expect(
    verifyCandidateReleaseProof({
      repository,
      revision,
      environment: "preview",
    }),
  ).rejects.toThrow("dashboard-web: current provider deployment ownership")
  expect(readFileSync(output, "utf8")).toBe(previous)
})

test("requires the proof environment and full current HEAD", async () => {
  const { repository, revision } = fixture()
  const output = join(repository, ".release/baselines.json")
  const previous = '{"version":1,"project":"ewatrade","baselines":{}}\n'
  writeFileSync(output, previous, { mode: 0o600 })
  configure(await validBundle(repository, revision))
  const proof = await verifyCandidateReleaseProof({
    repository,
    revision,
    environment: "preview",
  })
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "production", proof }),
  ).toThrow("ready proof for this exact HEAD and environment")
  writeFileSync(join(repository, "unrelated.txt"), "advance HEAD\n")
  git(repository, "add", "unrelated.txt")
  git(repository, "commit", "-qm", "advance after proof")
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "preview", proof }),
  ).toThrow("exact repository root and full checked-out revision")
  expect(readFileSync(output, "utf8")).toBe(previous)
})

test("rejects mismatched claim project, symlink parent, and symlink output", async () => {
  const { repository, revision } = fixture()
  const bundle = await validBundle(repository, revision)
  configure(bundle)
  const proof = await verifyCandidateReleaseProof({
    repository,
    revision,
    environment: "preview",
  })
  const output = join(repository, ".release/baselines.json")
  const previous = '{"version":1,"project":"wrong","baselines":{}}\n'
  writeFileSync(output, previous)
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "preview", proof }),
  ).toThrow("version or project does not match")
  expect(readFileSync(output, "utf8")).toBe(previous)

  rmSync(output)
  const parent = join(repository, ".release")
  const outside = mkdtempSync(join(tmpdir(), "ewatrade-baseline-parent-"))
  repositories.push(outside)
  rmSync(parent, { recursive: true, force: true })
  symlinkSync(outside, parent)
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "preview", proof }),
  ).toThrow("parent directory must not be a symlink")
  rmSync(parent)
  mkdirSync(parent)
  const target = join(outside, "target.json")
  writeFileSync(target, "keep\n")
  symlinkSync(target, output)
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "preview", proof }),
  ).toThrow("output must be a regular file, not a symlink")
  expect(readFileSync(target, "utf8")).toBe("keep\n")
})

test("freezes captured proof and refuses source changes before baseline write", async () => {
  const { repository, revision } = fixture()
  const output = join(repository, ".release/baselines.json")
  const previous = '{"version":1,"project":"ewatrade","baselines":{}}\n'
  writeFileSync(output, previous)
  configure(await validBundle(repository, revision))
  const proof = await verifyCandidateReleaseProof({
    repository,
    revision,
    environment: "preview",
  })
  expect(Object.isFrozen(proof.evidence.verified)).toBe(true)
  expect(Object.isFrozen(proof.manifest.targets)).toBe(true)
  expect(Object.isFrozen(proof.bundle.expo.builds[0])).toBe(true)
  writeFileSync(
    join(repository, "apps/mobile/app.config.ts"),
    "// changed after proof\n",
  )
  expect(() =>
    refreshReleaseBaselines({ repository, environment: "preview", proof }),
  ).toThrow("changed after baseline proof")
  expect(readFileSync(output, "utf8")).toBe(previous)
  await expect(
    verifyAndRefreshReleaseBaselines({
      repository,
      revision,
      environment: "preview",
    }),
  ).rejects.toThrow("differ from the committed revision")
  expect(readFileSync(output, "utf8")).toBe(previous)
})

test("CLI refuses invalid proof and leaves baseline bytes unchanged", async () => {
  const { repository, revision } = fixture()
  const output = join(repository, ".release/baselines.json")
  const previous = '{"version":1,"project":"ewatrade","baselines":{}}\n'
  writeFileSync(output, previous)
  configure(await validBundle(repository, revision))
  const valid = Bun.spawnSync(
    [
      "bun",
      "--env-file=/dev/null",
      join(root, "scripts/release-baselines.ts"),
      "--env",
      "preview",
      "--repo",
      repository,
      "--revision",
      revision,
    ],
    { cwd: repository, env: process.env },
  )
  expect(valid.exitCode).toBe(0)
  expect(JSON.parse(valid.stdout.toString()).advisory).toBe(true)
  const verifiedBytes = readFileSync(output, "utf8")
  writeFileSync(
    join(repository, "apps/mobile/app.config.ts"),
    "// dirty CLI candidate\n",
  )
  const invalid = Bun.spawnSync(
    [
      "bun",
      "--env-file=/dev/null",
      join(root, "scripts/release-baselines.ts"),
      "--env",
      "preview",
      "--repo",
      repository,
      "--revision",
      revision,
    ],
    { cwd: repository, env: process.env },
  )
  expect(invalid.exitCode).toBe(2)
  expect(readFileSync(output, "utf8")).toBe(verifiedBytes)
})
