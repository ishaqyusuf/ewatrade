import { afterEach, describe, expect, test } from "bun:test"
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
  JOBS_TARGET,
  MOBILE_PROJECT,
  MOBILE_TARGET,
  WEB_TARGETS,
  createEwaTradeProviderBindings,
  loadSignedProviderBundle,
} from "../.release/ewatrade-provider-bundle"
import { runConsumerReleaseCheck } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/consumer"
import { validateReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/manifest"
import {
  type ReleaseManifest,
  type ReleaseTargetChange,
  planRelease,
} from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { compareExpoNativeEnvironment } from "./release-expo-environment"
import { resolveNativeEnvironment } from "./release-mobile-environment"
import { assertMobileEnvironmentReceipt } from "./release-mobile-preflight"
import { releaseGit } from "./release-source"

const root = resolve(import.meta.dir, "..")
const repositories: string[] = []
const toolkitRevision = "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7"
const secret = "release-test-key-with-at-least-32-bytes"
const originalEnvelope = process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE
const originalKey = process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY

test("Production API release evidence targets the dedicated API hostname", () => {
  expect(
    WEB_TARGETS.find((target) => target.targetId === "api-web"),
  ).toMatchObject({
    projectId: "prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh",
    productionDomain: "api.ewatrade.com",
  })
})

test("dashboard release evidence targets the dedicated dashboard project", () => {
  expect(
    WEB_TARGETS.find((target) => target.targetId === "dashboard-web"),
  ).toMatchObject({
    projectId: "prj_KPSnNRftlTWRgW67OsnH2vUHzLYO",
    productionDomain: "dashboard.ewatrade.com",
  })
})

afterEach(() => {
  for (const repository of repositories.splice(0))
    rmSync(repository, { recursive: true, force: true })
  if (originalEnvelope === undefined) {
    Reflect.deleteProperty(process.env, "EWATRADE_RELEASE_EVIDENCE_ENVELOPE")
  } else {
    process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE = originalEnvelope
  }
  if (originalKey === undefined) {
    Reflect.deleteProperty(process.env, "EWATRADE_RELEASE_EVIDENCE_HMAC_KEY")
  } else {
    process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY = originalKey
  }
})

function git(repository: string, ...args: string[]) {
  return releaseGit(repository, ["-c", "core.hooksPath=/dev/null", ...args])
}

function fixture() {
  const repository = mkdtempSync(
    join(tmpdir(), "ewatrade-release-composition-"),
  )
  repositories.push(repository)
  git(repository, "init", "-q", "--initial-branch=main")
  git(repository, "config", "user.name", "Release Composition Test")
  git(repository, "config", "user.email", "release-composition@example.invalid")
  writeFileSync(
    join(repository, "release.manifest.json"),
    readFileSync(join(root, "release.manifest.json")),
  )
  mkdirSync(join(repository, "apps/mobile"), { recursive: true })
  const easConfiguration = readFileSync(join(root, "apps/mobile/eas.json"))
  writeFileSync(join(repository, "apps/mobile/eas.json"), easConfiguration)
  git(repository, "add", "release.manifest.json", "apps/mobile/eas.json")
  git(repository, "commit", "-qm", "release composition fixture")
  const revision = git(repository, "rev-parse", "HEAD")
  expect(git(repository, "show", `${revision}:apps/mobile/eas.json`)).toBe(
    easConfiguration.toString().trim(),
  )
  return { repository, revision }
}

function manifest() {
  return JSON.parse(
    readFileSync(resolve(root, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
}

function assertCommittedEasReceipt(
  context: {
    environment: "preview" | "production"
    revision: string
    repository: string
    toolkitRevision: string
  },
  bundle: EwaTradeProviderBundle,
) {
  const sourceFingerprint = "f".repeat(64)
  const nativeContext = {
    revision: context.revision,
    environment: context.environment,
    sourceFingerprint,
  }
  const state = resolveNativeEnvironment(nativeContext, {}).state
  const eas = JSON.parse(
    git(context.repository, "show", `${context.revision}:apps/mobile/eas.json`),
  )
  bundle.sourceFingerprints = { mobile: sourceFingerprint }
  bundle.expo.nativeEnvironment = state
  bundle.expo.nativeEnvironmentParity = compareExpoNativeEnvironment(
    nativeContext,
    state,
    eas,
    {
      data: {
        app: {
          byId: {
            id: MOBILE_TARGET.projectId,
            slug: MOBILE_PROJECT.slug,
            projectVariables: [],
            ownerAccount: {
              id: "fixture-owner",
              name: MOBILE_PROJECT.owner,
              accountVariables: [],
            },
          },
        },
      },
    },
    {},
  )

  const protectedNativeEnvironment = {
    json: process.env.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON,
    digest: process.env.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256,
  }
  Reflect.deleteProperty(
    process.env,
    "EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON",
  )
  Reflect.deleteProperty(
    process.env,
    "EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256",
  )
  try {
    // This resolves eas.json from the fixture's committed Git object, then checks
    // the synthetic provider parity receipt against that exact committed profile.
    assertMobileEnvironmentReceipt(context, bundle)
  } finally {
    if (protectedNativeEnvironment.json === undefined)
      Reflect.deleteProperty(
        process.env,
        "EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON",
      )
    else
      process.env.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON =
        protectedNativeEnvironment.json
    if (protectedNativeEnvironment.digest === undefined)
      Reflect.deleteProperty(
        process.env,
        "EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256",
      )
    else
      process.env.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256 =
        protectedNativeEnvironment.digest
  }
}

function signedEnvelope(bundle: EwaTradeProviderBundle) {
  const payload = Buffer.from(JSON.stringify(bundle)).toString("base64url")
  return JSON.stringify({
    version: 1,
    payload,
    signature: createHmac("sha256", secret).update(payload).digest("hex"),
  })
}

function bundle(
  environment: "preview" | "production",
  releaseRevision: string,
): EwaTradeProviderBundle {
  const fingerprints = {
    "api-web": { kind: "configuration" as const, value: "2".repeat(64) },
    "dashboard-web": {
      kind: "configuration" as const,
      value: "6".repeat(64),
    },
    "marketing-web": {
      kind: "configuration" as const,
      value: "3".repeat(64),
    },
    mobile: { kind: "native" as const, value: "4".repeat(64) },
    jobs: { kind: "configuration" as const, value: "5".repeat(64) },
  }
  const descriptors = [
    {
      targetId: "api-web",
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
      targetId: "dashboard-web",
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
  const now = Date.now()
  const completedAt = new Date(now - 10_000).toISOString()
  const observedAt = new Date(now).toISOString()
  const receipts = descriptors.map((descriptor, index) => ({
    version: 1 as const,
    project: "ewatrade",
    ...descriptor,
    environment,
    revision: releaseRevision,
    fingerprint: fingerprints[descriptor.targetId as keyof typeof fingerprints],
    deploymentId: `deployment_${index + 1}`,
    result: "succeeded" as const,
    completedAt,
  }))
  const jobsMapping = JOBS_TARGET[environment]
  return {
    version: 1,
    project: "ewatrade",
    environment,
    revision: releaseRevision,
    generatedAt: observedAt,
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
      observedAt,
    })),
    fingerprints,
    vercel: {
      deploymentIds: {},
      deployments: [],
      domains: [],
    },
    expo: {
      fingerprints: { android: null, ios: null },
      runtimeVersions: { android: null, ios: null },
      baselineBuildIds: {},
      newBuildIds: {},
      updateGroupIds: {},
      builds: [],
      updates: [],
      channels: [],
    },
    jobs: {
      deploymentIds: { jobs: "deployment_5" },
      configurationFingerprints: { jobs: fingerprints.jobs.value },
      deployments: [
        {
          id: "deployment_5",
          provider: "trigger",
          projectRef:
            jobsMapping.capability === "isolated"
              ? (jobsMapping.projectRef ?? JOBS_TARGET.projectRef)
              : "",
          providerEnvironment: "prod",
          branch: null,
          revision: releaseRevision,
          configurationFingerprint: fingerprints.jobs.value,
          version: "fixture-jobs-1",
          status: "deployed",
          current: true,
        },
      ],
    },
  }
}

describe("Ewa Trade release manifest", () => {
  test("maps only evidenced deployable surfaces and preserves the five application targets", () => {
    const releaseManifest = manifest()
    expect(() => validateReleaseManifest(releaseManifest)).not.toThrow()
    expect(
      releaseManifest.targets.find((target) => target.id === "dashboard-web"),
    ).toMatchObject({
      kind: "web",
      prerequisites: ["api-web"],
    })
    expect(releaseManifest.targets.map((target) => target.id)).toEqual([
      "api-web",
      "dashboard-web",
      "marketing-web",
      "mobile",
      "jobs",
    ])
    const changes: Record<string, ReleaseTargetChange> = Object.fromEntries(
      releaseManifest.targets.map((target) => [
        target.id,
        {
          baseRevision: "a".repeat(40),
          changedPaths: [],
          ...(target.kind === "mobile"
            ? {
                nativeFingerprint: {
                  base: "b".repeat(64),
                  current: "b".repeat(64),
                },
              }
            : {}),
        } satisfies ReleaseTargetChange,
      ]),
    )
    changes["api-web"] = {
      baseRevision: "a".repeat(40),
      changedPaths: ["apps/api/src/trpc/routers/_app.ts"],
    }
    const applicationPlan = planRelease(releaseManifest, {
      environment: "preview",
      revision: "c".repeat(40),
      targetChanges: changes,
    })
    expect(applicationPlan.actions.map((action) => action.targetId)).toEqual([
      "api-web",
      "dashboard-web",
      "marketing-web",
    ])
    const mobilePlan = planRelease(releaseManifest, {
      environment: "production",
      revision: "d".repeat(40),
      targetChanges: {
        ...Object.fromEntries(
          releaseManifest.targets.map((target) => [
            target.id,
            { baseRevision: "a".repeat(40), changedPaths: [] },
          ]),
        ),
        mobile: {
          baseRevision: "a".repeat(40),
          changedPaths: ["apps/mobile/src/app/index.tsx"],
          nativeFingerprint: {
            base: "b".repeat(64),
            current: "b".repeat(64),
          },
        },
      },
    })
    expect(mobilePlan.actions).toHaveLength(1)
    expect(mobilePlan.actions[0]?.action).toBe("mobile-update")
  })
})

describe("Ewa Trade signed provider binding composition", () => {
  test("rejects missing or tampered evidence before provider verification", () => {
    const { repository, revision: releaseRevision } = fixture()
    const context = {
      environment: "preview" as const,
      revision: releaseRevision,
      repository,
      toolkitRevision,
    }
    Reflect.deleteProperty(process.env, "EWATRADE_RELEASE_EVIDENCE_HMAC_KEY")
    expect(() => loadSignedProviderBundle(context)).toThrow(
      "key is unavailable",
    )
    process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY = secret
    process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE = JSON.stringify({
      version: 1,
      payload: Buffer.from("{}").toString("base64url"),
      signature: "0".repeat(64),
    })
    expect(() => loadSignedProviderBundle(context)).toThrow(
      "evidence is invalid",
    )
  })

  for (const environment of ["preview", "production"] as const) {
    test(`${environment} composes synthetic signed unchanged-target receipts`, async () => {
      const { repository, revision: releaseRevision } = fixture()
      expect(releaseRevision).toMatch(/^[0-9a-f]{40}$/)
      process.env.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY = secret
      const providerBundle = bundle(environment, releaseRevision)
      process.env.EWATRADE_RELEASE_EVIDENCE_ENVELOPE =
        signedEnvelope(providerBundle)
      const context = {
        environment,
        revision: releaseRevision,
        repository,
        toolkitRevision,
      }
      assertCommittedEasReceipt(context, providerBundle)
      const report = await runConsumerReleaseCheck(
        context,
        createEwaTradeProviderBindings(context),
      )
      expect(report.ready).toBe(true)
      expect(report.environment).toBe(environment)
      expect(report.targets).toHaveLength(5)
      expect(
        report.targets.every((target) => target.reason === "verified"),
      ).toBe(true)
      expect(
        report.targets.find((target) => target.targetId === "jobs")?.reason,
      ).toBe("verified")
    })
  }
})
