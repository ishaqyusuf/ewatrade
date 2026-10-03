import { afterEach, expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
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
import {
  type EwaTradeProviderBundle,
  JOBS_TARGET,
  MOBILE_TARGET,
  WEB_TARGETS,
  createEwaTradeProviderBindings,
} from "../.release/ewatrade-provider-bundle"
import { checkRelease } from "../.release/release-adapter"
import { verifyReleaseEvidence } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/evidence"
import {
  type ReleaseManifest,
  planRelease,
} from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { releaseContract } from "./release-contract"
import { compareExpoNativeEnvironment } from "./release-expo-environment"
import { resolveNativeEnvironment } from "./release-mobile-environment"
import { mobileNativeDigest } from "./release-mobile-fingerprint"
import {
  committedSourceFingerprints,
  dirtyReleaseInputs,
  releaseGit,
} from "./release-source"
import { verifyCandidateRelease } from "./release-verify"

const root = resolve(import.meta.dir, "..")
const secret = "release-verifier-test-secret-with-32-bytes-minimum"
const priorEnvironment = {
  envelope: process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE,
  key: process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY,
}
const repositories: string[] = []

function git(repository: string, ...args: string[]) {
  return releaseGit(repository, ["-c", "core.hooksPath=/dev/null", ...args])
}

function fixture() {
  const repository = mkdtempSync(join(tmpdir(), "ewatrade-release-verify-"))
  repositories.push(repository)
  git(repository, "init", "-q", "--initial-branch=main")
  git(repository, "config", "user.name", "Release Verify Test")
  git(repository, "config", "user.email", "release-verify@example.invalid")

  writeFileSync(
    join(repository, "release.manifest.json"),
    readFileSync(resolve(root, "release.manifest.json")),
  )
  writeFileSync(
    join(repository, "package.json"),
    '{"name":"ewatrade-fixture"}\n',
  )
  mkdirSync(
    join(repository, "packages/db/prisma/migrations/20261002000000_fixture"),
    { recursive: true },
  )
  writeFileSync(
    join(repository, "packages/db/prisma/schema.prisma"),
    "// verifier fixture schema\nmodel Fixture {\n  id String @id\n}\n",
  )
  writeFileSync(
    join(
      repository,
      "packages/db/prisma/migrations/20261002000000_fixture/migration.sql",
    ),
    "CREATE TABLE fixture (id text PRIMARY KEY);\n",
  )
  mkdirSync(join(repository, "apps/mobile"), { recursive: true })
  writeFileSync(
    join(repository, "apps/mobile/eas.json"),
    JSON.stringify({
      cli: { appVersionSource: "remote" },
      build: {
        preview: {
          environment: "preview",
          channel: "preview",
          autoIncrement: true,
        },
        production: {
          environment: "production",
          channel: "production",
          autoIncrement: true,
        },
      },
    }),
  )
  const selectedSentinels = [
    "apps/api/src/trpc/routers/_app.ts",
    "apps/dashboard/src/verifier-fixture.ts",
    "apps/marketing/src/verifier-fixture.ts",
    "apps/mobile/src/verifier-fixture.ts",
    "apps/mobile/app.config.ts",
    "packages/jobs/src/verifier-fixture.ts",
  ]
  for (const path of selectedSentinels) {
    const fullPath = join(repository, path)
    mkdirSync(join(fullPath, ".."), { recursive: true })
    writeFileSync(
      fullPath,
      'throw new Error("candidate source must not execute")\n',
    )
  }

  git(repository, "add", ".")
  git(repository, "commit", "-qm", "release verifier candidate")
  const revision = git(repository, "rev-parse", "HEAD")
  return { repository: realpathSync(repository), revision }
}

function signedEnvelope(bundle: unknown) {
  const payload = Buffer.from(JSON.stringify(bundle)).toString("base64url")
  return JSON.stringify({
    version: 1,
    payload,
    signature: createHmac("sha256", secret).update(payload).digest("hex"),
  })
}

function fingerprints(repository: string, revision: string) {
  const manifest = JSON.parse(
    readFileSync(join(repository, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  const sourceFingerprints = committedSourceFingerprints(
    repository,
    revision,
    manifest,
  )
  const now = new Date().toISOString()
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex")
  const targetFingerprints = {
    "api-web": { kind: "configuration" as const, value: digest("api") },
    "dashboard-web": {
      kind: "configuration" as const,
      value: digest("dashboard"),
    },
    "marketing-web": {
      kind: "configuration" as const,
      value: digest("marketing"),
    },
    mobile: { kind: "native" as const, value: digest("mobile") },
    jobs: { kind: "configuration" as const, value: digest("jobs") },
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
    deploymentId: `release-fixture-${index + 1}`,
    result: "succeeded" as const,
    completedAt: now,
  }))
  const contract = releaseContract(
    root,
    "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7",
  )
  const bundle: EwaTradeProviderBundle = {
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
      fingerprints: {
        android: targetFingerprints.mobile.value,
        ios: targetFingerprints.mobile.value,
      },
      runtimeVersions: { android: "1", ios: "1" },
      baselineBuildIds: {
        android: "expo-android-build",
        ios: "expo-ios-build",
      },
      newBuildIds: {},
      updateGroupIds: {},
      builds: (["android", "ios"] as const).map((platform) => ({
        id: `expo-${platform}-build`,
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
  bundle.expo.nativeEnvironment = resolveNativeEnvironment(
    {
      revision,
      environment: bundle.environment,
      sourceFingerprint: sourceFingerprints.mobile,
    },
    {},
  ).state
  bundle.expo.nativeEnvironmentParity = compareExpoNativeEnvironment(
    {
      revision,
      environment: bundle.environment,
      sourceFingerprint: sourceFingerprints.mobile,
    },
    bundle.expo.nativeEnvironment,
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
  return { bundle, sourceFingerprints }
}

function configure(bundle: unknown) {
  process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY = secret
  process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE = signedEnvelope(bundle)
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true })
  }
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
  restore("EWATRADE_RELEASE_EVIDENCE_ENVELOPE", priorEnvironment.envelope)
  restore("EWATRADE_RELEASE_EVIDENCE_HMAC_KEY", priorEnvironment.key)
})

test("verifies an unchanged candidate from committed Git, source, policy, and provider evidence", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  configure(bundle)
  const report = await verifyCandidateRelease({
    repository,
    revision,
    environment: "preview",
  })
  expect(report).toMatchObject({
    project: "ewatrade",
    environment: "preview",
    revision,
    ready: true,
  })
  const adapterReport = await checkRelease({
    repository,
    revision,
    environment: "preview",
    toolkitRevision: "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7",
  })
  expect(adapterReport).toEqual(report)
})

test("Preview jobs proof cannot use the real Production project or an invented provider branch", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  for (const changes of [
    { projectRef: JOBS_TARGET.production.projectRef ?? JOBS_TARGET.projectRef },
    { branch: "preview" },
    { providerEnvironment: "preview" },
  ]) {
    const copy: EwaTradeProviderBundle = structuredClone(bundle)
    copy.jobs.deployments = copy.jobs.deployments.map((deployment) => ({
      ...deployment,
      ...changes,
    }))
    configure(copy)
    const report = await verifyCandidateRelease({
      repository,
      revision,
      environment: "preview",
    })
    expect(report.ready).toBe(false)
  }
})

test("rejects missing or mismatched trusted policy and source fingerprints", async () => {
  const { repository, revision } = fixture()
  const { bundle, sourceFingerprints } = fingerprints(repository, revision)
  configure({ ...bundle, policyFingerprint: undefined })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("trusted toolkit and release policy")
  configure({ ...bundle, policyFingerprint: "0".repeat(64) })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("trusted toolkit and release policy")
  configure({ ...bundle, sourceFingerprints: undefined })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("source fingerprints are missing")
  configure({
    ...bundle,
    sourceFingerprints: {
      ...sourceFingerprints,
      "dashboard-web": "0".repeat(64),
    },
  })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("source fingerprints are missing or differ")
})

test("release gate refuses missing, stale or altered native environment parity proof", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  const receipt = bundle.expo.nativeEnvironmentParity
  if (!receipt) throw new Error("Missing parity fixture")
  for (const altered of [
    undefined,
    { ...receipt, observedAt: new Date(Date.now() - 600_000).toISOString() },
    { ...receipt, nativeEnvironmentFingerprint: "f".repeat(64) },
    { ...receipt, queryFingerprint: "f".repeat(64) },
  ]) {
    const copy = structuredClone(bundle)
    copy.expo.nativeEnvironmentParity = altered
    configure(copy)
    await expect(
      verifyCandidateRelease({ repository, revision, environment: "preview" }),
    ).rejects.toThrow("parity receipt")
  }
})

test("requires exact web provider ownership and both unchanged mobile platforms", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  const dashboardId = bundle.vercel.deploymentIds["dashboard-web"]
  configure({
    ...bundle,
    vercel: {
      ...bundle.vercel,
      deployments: bundle.vercel.deployments.map((deployment) =>
        deployment.id === dashboardId
          ? { ...deployment, projectId: "wrong-vercel-project" }
          : deployment,
      ),
    },
  })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("dashboard-web: current provider deployment ownership")

  configure({
    ...bundle,
    expo: {
      ...bundle.expo,
      builds: bundle.expo.builds.filter((build) => build.platform !== "ios"),
    },
  })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("ios: current compatible mobile build is unverified")
})

test("signed metadata-only web claims cannot authenticate even unchanged targets", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  configure({
    ...bundle,
    vercel: {
      ...bundle.vercel,
      deployments: bundle.vercel.deployments.map(
        ({ gitSource, ...deployment }) => ({
          ...deployment,
          meta: { githubCommitSha: gitSource?.sha },
        }),
      ),
    },
  })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow(
    "current provider deployment ownership, source or environment is unverified",
  )
})

test("Production alias proof requires exact domain assignments", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  configure({
    ...bundle,
    environment: "production",
    vercel: {
      ...bundle.vercel,
      deployments: bundle.vercel.deployments.map((deployment) => ({
        ...deployment,
        target: "production",
      })),
      domains: WEB_TARGETS.map((target, index) => ({
        domain: target.productionDomain,
        assignment: {
          deploymentId:
            index === 0
              ? "wrong-deployment"
              : bundle.vercel.deploymentIds[target.targetId],
          assignedAt: new Date().toISOString(),
        },
      })),
    },
  })
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "production" }),
  ).rejects.toThrow("dashboard-web: current Production alias is unverified")
})

test("raw Expo SHA1 reaches the immutable toolkit through an explicit digest adapter", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  bundle.expo.fingerprints = { android: "a".repeat(40), ios: "b".repeat(40) }
  bundle.expo.builds = bundle.expo.builds.map((build) => ({
    ...build,
    fingerprint: bundle.expo.fingerprints[build.platform] ?? "",
  }))
  bundle.expo.nativeConfiguration = {
    appVersion: "1.1.0",
    runtimePolicies: { android: "appVersion", ios: "appVersion" },
  }
  bundle.expo.runtimeVersions = { android: "1.1.0", ios: "1.1.0" }
  const baselineBuilds = bundle.expo.builds
  const newBuilds = baselineBuilds.map((build) => ({
    ...build,
    id: `${build.id}-new`,
    appVersion: "1.1.0",
    runtimeVersion: "1.1.0",
    appBuildVersion: "10",
  }))
  bundle.expo.builds = [
    ...baselineBuilds.map((build) => ({
      ...build,
      runtimeVersion: "1.0.0",
      appVersion: "1.0.0",
      appBuildVersion: "9",
    })),
    ...newBuilds,
  ]
  bundle.expo.newBuildIds = Object.fromEntries(
    newBuilds.map((build) => [build.platform, build.id]),
  )
  const fingerprint = bundle.fingerprints.mobile
  if (!fingerprint) throw new Error("Mobile fixture fingerprint is missing.")
  fingerprint.value = mobileNativeDigest({
    projectId: MOBILE_TARGET.projectId,
    environment: bundle.environment,
    ...MOBILE_TARGET.preview,
    fingerprints: bundle.expo.fingerprints,
    runtimeVersions: bundle.expo.runtimeVersions,
  })
  configure(bundle)
  expect(
    (
      await verifyCandidateRelease({
        repository,
        revision,
        environment: "preview",
      })
    ).ready,
  ).toBe(true)
  const manifest = JSON.parse(
    readFileSync(join(repository, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  const plan = planRelease(manifest, {
    environment: "preview",
    revision,
    targetChanges: Object.fromEntries(
      manifest.targets.map((target) => [
        target.id,
        {
          baseRevision: revision,
          changedPaths:
            target.id === "mobile" ? ["apps/mobile/app.config.ts"] : [],
        },
      ]),
    ),
  })
  const context = {
    repository,
    revision,
    environment: "preview" as const,
    toolkitRevision: "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7",
  }
  const bindings = createEwaTradeProviderBindings(context, bundle)
  const evidence = await verifyReleaseEvidence(
    manifest,
    "preview",
    bundle.receipts,
    bindings.lookupEvidence,
  )
  const actions = await bindings.verifyActions(
    context,
    manifest,
    plan,
    evidence,
  )
  expect(actions.mobile?.[0]).toMatchObject({ ready: true })
  expect(bundle.expo.builds[0]?.fingerprint).toHaveLength(40)
  fingerprint.value = "e".repeat(64)
  configure(bundle)
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("does not bind both raw native")
})

test("rejects dirty release inputs and a revision other than checked-out HEAD", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  configure(bundle)
  writeFileSync(
    join(repository, "apps/dashboard/src/verifier-fixture.ts"),
    "changed\n",
  )
  await expect(
    verifyCandidateRelease({ repository, revision, environment: "preview" }),
  ).rejects.toThrow("Candidate release inputs differ")
  writeFileSync(
    join(repository, "apps/dashboard/src/verifier-fixture.ts"),
    'throw new Error("candidate source must not execute")\n',
  )
  await expect(
    verifyCandidateRelease({
      repository,
      revision: "f".repeat(40),
      environment: "preview",
    }),
  ).rejects.toThrow("full checked-out revision")
})

test("sparse checkout preserves hashes, cleanliness, and full release verification", async () => {
  const { repository, revision } = fixture()
  const { bundle } = fingerprints(repository, revision)
  const manifest = JSON.parse(
    readFileSync(join(repository, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  const before = committedSourceFingerprints(repository, revision, manifest)
  git(repository, "sparse-checkout", "init", "--no-cone")
  git(
    repository,
    "sparse-checkout",
    "set",
    "--no-cone",
    "/release.manifest.json",
  )
  expect(
    readFileSync(join(repository, "release.manifest.json"), "utf8").length,
  ).toBeGreaterThan(0)
  expect(dirtyReleaseInputs(repository, manifest)).toEqual([])
  expect(committedSourceFingerprints(repository, revision, manifest)).toEqual(
    before,
  )
  configure(bundle)
  const report = await verifyCandidateRelease({
    repository,
    revision,
    environment: "preview",
  })
  expect(report.ready).toBe(true)
})
