import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { verifyVendorSnapshot } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/vendor"
import { releaseContract } from "./release-contract"
import {
  collectNeutralExpoProviderState,
  validateExpoSourceState,
} from "./release-expo-collect"
import type { ExpoCollection, ExpoSourceState } from "./release-expo-collect"
import {
  generateMobileSourceState,
  isCertifiedMobileSourceState,
} from "./release-mobile-source"
import {
  assertReleaseRevision,
  assertTrustedTopology,
  committedManifest,
  committedSourceFingerprints,
  dirtyReleaseInputs,
  releaseGit,
} from "./release-source"
import { collectTriggerFacts } from "./release-trigger-collect"
import type { TriggerCollection } from "./release-trigger-collect"
import { EWATRADE_TRIGGER_TARGET } from "./release-trigger-target"
import { collectVercelFacts } from "./release-vercel-collect"
import type { VercelCollection } from "./release-vercel-collect"
import {
  type VercelSourceBinding,
  bindVercelSource,
} from "./release-vercel-source"

type Environment = "preview" | "production"

/** Injected functions keep tests and provider orchestration separate from signing. */
export type ReleaseCollectionAdapters = {
  vercel?: (input: {
    environment: Environment
    previewDeploymentIds?: Record<string, string>
  }) => Promise<VercelCollection>
  trigger?: (input: {
    revision: string
    environment: Environment
    expectedOrganizationId: string
  }) => Promise<TriggerCollection>
  expo?: (input: {
    environment: Environment
    revision: string
    sourceState: ExpoSourceState
    baselineBuildIds: Record<"android" | "ios", string>
    nativeEasConfiguration: unknown
  }) => Promise<ExpoCollection>
}

export type ReleaseCollection = {
  version: 1
  project: "ewatrade"
  environment: Environment
  revision: string
  observedAt: string
  sourceHashes: Record<string, string>
  contract: { toolkitRevision: string; policyFingerprint: string }
  fragments: {
    vercel: VercelCollection | null
    vercelSource: VercelSourceBinding[]
    trigger: TriggerCollection | null
    expo: ExpoCollection | null
    mobile: {
      sourceStateBound: boolean
      provenanceVerified: boolean
      blockers: string[]
    }
  }
  blockers: Array<{ targetId: string; reason: string }>
  releaseReady: false
}

function committedText(repository: string, revision: string, path: string) {
  return releaseGit(repository, ["show", `${revision}:${path}`])
}

/**
 * Performs trusted preflight before any provider adapter is called. It reads
 * only Git objects and trusted verifier files; candidate configs and modules
 * are never imported or executed. This report is unsigned and never ready.
 */
export async function collectReleaseFacts(input: {
  repository: string
  revision: string
  environment: Environment
  previewDeploymentIds?: Record<string, string>
  mobileSourceState?: ExpoSourceState
  generateMobileSource?: boolean
  expoBaselineBuildIds?: Record<"android" | "ios", string>
  expectedTriggerOrganizationId?: string
  adapters?: ReleaseCollectionAdapters
}): Promise<ReleaseCollection> {
  if (!input || !["preview", "production"].includes(input.environment))
    throw new Error("Choose a release environment.")
  const repository = assertReleaseRevision(input.repository, input.revision)
  const trustedRoot = resolve(import.meta.dir, "..")
  const lock = verifyVendorSnapshot(trustedRoot)
  const contract = releaseContract(trustedRoot, lock.toolkitRevision)
  const trusted = JSON.parse(
    readFileSync(resolve(trustedRoot, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  const manifest = committedManifest(repository, input.revision)
  assertTrustedTopology(manifest, trusted)

  // These policy/toolkit declarations are security inputs and must agree with
  // the trusted checkout before authenticated provider reads begin.
  const committedPolicy = committedText(
    repository,
    input.revision,
    ".release/policy.json",
  )
  const trustedPolicy = readFileSync(
    resolve(trustedRoot, ".release/policy.json"),
    "utf8",
  ).trim()
  const committedLock = committedText(
    repository,
    input.revision,
    ".release/toolkit.lock.json",
  )
  const trustedLock = readFileSync(
    resolve(trustedRoot, ".release/toolkit.lock.json"),
    "utf8",
  ).trim()
  if (
    committedPolicy.trim() !== trustedPolicy ||
    committedLock.trim() !== trustedLock
  )
    throw new Error("Candidate release policy or toolkit binding is untrusted.")

  const dirty = dirtyReleaseInputs(repository, manifest)
  if (dirty.length)
    throw new Error(
      "Candidate release source or deployment configuration is dirty.",
    )
  const sourceHashes = committedSourceFingerprints(
    repository,
    input.revision,
    manifest,
  )
  const observedAt = new Date().toISOString()
  const result: ReleaseCollection = {
    version: 1,
    project: "ewatrade",
    environment: input.environment,
    revision: input.revision,
    observedAt,
    sourceHashes,
    contract: {
      toolkitRevision: lock.toolkitRevision,
      policyFingerprint: contract.policyFingerprint,
    },
    fragments: {
      vercel: null,
      vercelSource: [],
      trigger: null,
      expo: null,
      mobile: {
        sourceStateBound: false,
        provenanceVerified: false,
        blockers: [],
      },
    },
    blockers: [],
    releaseReady: false,
  }
  const mobileBlockers: string[] = []
  let sourceState = input.mobileSourceState
  if (input.generateMobileSource) {
    try {
      sourceState = await generateMobileSourceState({
        repository,
        revision: input.revision,
        environment: input.environment,
      })
    } catch {
      sourceState = undefined
      mobileBlockers.push("isolated-mobile-source-generation-failed")
    }
  }
  if (!sourceState) {
    mobileBlockers.push("credential-free-mobile-source-state-unavailable")
  } else {
    try {
      validateExpoSourceState(sourceState, input.revision, input.environment)
      if (sourceState.sourceFingerprint !== sourceHashes.mobile) {
        mobileBlockers.push(
          "mobile-source-state-fingerprint-does-not-match-committed-source",
        )
      } else {
        result.fragments.mobile.sourceStateBound = true
        if (isCertifiedMobileSourceState(sourceState))
          result.fragments.mobile.provenanceVerified = true
        else
          mobileBlockers.push(
            "mobile-source-state-provenance-is-not-authenticated-by-a-trusted-generator",
          )
      }
    } catch {
      mobileBlockers.push(
        "mobile-source-state-is-not-bound-to-exact-revision-and-environment",
      )
    }
  }
  result.fragments.mobile.blockers = mobileBlockers
  result.blockers.push(
    ...mobileBlockers.map((reason) => ({ targetId: "mobile", reason })),
  )

  const adapters = input.adapters ?? {}
  // Source generation can be slow. Reject a changed checkout before credentials
  // are used, and again before exporting the combined observation.
  const recheckSource = () => {
    assertReleaseRevision(repository, input.revision)
    committedManifest(repository, input.revision)
    if (dirtyReleaseInputs(repository, manifest).length)
      throw new Error("Candidate release inputs changed during collection.")
  }
  recheckSource()
  if (result.fragments.mobile.provenanceVerified && sourceState) {
    const ids = input.expoBaselineBuildIds
    if (
      !ids ||
      ![ids.android, ids.ios].every(
        (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id),
      )
    ) {
      result.blockers.push({
        targetId: "mobile",
        reason: "explicit-android-and-ios-baseline-build-identifiers-required",
      })
    } else {
      try {
        const request = {
          environment: input.environment,
          revision: input.revision,
          sourceState,
          baselineBuildIds: ids,
          nativeEasConfiguration: JSON.parse(
            committedText(repository, input.revision, "apps/mobile/eas.json"),
          ),
        }
        const facts = adapters.expo
          ? await adapters.expo(request)
          : await collectNeutralExpoProviderState(request)
        if (
          facts.revision !== input.revision ||
          facts.environment !== input.environment
        )
          throw new Error("Expo source/environment binding mismatch")
        result.fragments.expo = facts
        result.blockers.push(
          ...facts.unsupported.map((reason) => ({
            targetId: "mobile",
            reason,
          })),
        )
      } catch {
        result.blockers.push({
          targetId: "mobile",
          reason: "expo-fact-collection-failed",
        })
      }
    }
  }
  const previewIds = input.previewDeploymentIds
  const validPreviewIds =
    previewIds !== undefined &&
    Object.keys(previewIds).length === WEB_TARGETS.length &&
    WEB_TARGETS.every((target) =>
      /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(previewIds[target.targetId] ?? ""),
    )
  // Provider stages begin only after all candidate source/config checks above.
  // Adapter errors are deliberately reduced to static blocker codes.
  if (adapters.vercel) {
    try {
      const facts = await adapters.vercel({
        environment: input.environment,
        previewDeploymentIds: previewIds,
      })
      if (facts.environment !== input.environment)
        throw new Error("Vercel environment binding mismatch")
      result.fragments.vercel = facts
      result.blockers.push(...facts.blockers)
    } catch {
      result.blockers.push({
        targetId: "web",
        reason: "vercel-fact-collection-failed",
      })
    }
  } else if (
    input.environment === "production" ||
    (input.environment === "preview" && validPreviewIds)
  ) {
    try {
      const facts = await collectVercelFacts({
        environment: input.environment,
        previewDeploymentIds: previewIds,
      })
      if (facts.environment !== input.environment)
        throw new Error("Vercel environment binding mismatch")
      result.fragments.vercel = facts
      result.blockers.push(...facts.blockers)
    } catch {
      result.blockers.push({
        targetId: "web",
        reason: "vercel-fact-collection-failed",
      })
    }
  } else {
    result.blockers.push({
      targetId: "web",
      reason: "preview-deployment-identifiers-required-for-read-only-lookup",
    })
  }

  if (result.fragments.vercel) {
    try {
      const bindings = bindVercelSource({
        repository,
        revision: input.revision,
        environment: input.environment,
        collection: result.fragments.vercel,
      })
      result.fragments.vercelSource = bindings
      result.blockers.push(
        ...bindings.flatMap((binding) =>
          binding.reason
            ? [{ targetId: binding.targetId, reason: binding.reason }]
            : [],
        ),
      )
    } catch {
      result.blockers.push({
        targetId: "web",
        reason: "vercel-source-reconciliation-failed",
      })
    }
  }

  const expectedOrganizationId =
    input.expectedTriggerOrganizationId ??
    (process.env.TRIGGER_EXPECTED_ORGANIZATION_ID?.trim() || undefined) ??
    EWATRADE_TRIGGER_TARGET.organizationId
  if (adapters.trigger) {
    try {
      const facts = await adapters.trigger({
        revision: input.revision,
        environment: input.environment,
        expectedOrganizationId,
      })
      if (
        facts.provider !== "trigger" ||
        facts.environment !== input.environment ||
        facts.revision !== input.revision
      )
        throw new Error(
          "Trigger provider, environment or revision binding mismatch",
        )
      result.fragments.trigger = facts
      result.blockers.push(...facts.blockers)
    } catch {
      result.blockers.push({
        targetId: "jobs",
        reason: "trigger-fact-collection-failed",
      })
    }
  } else {
    try {
      const facts = await collectTriggerFacts({
        revision: input.revision,
        environment: input.environment,
        expectedOrganizationId,
      })
      if (
        facts.provider !== "trigger" ||
        facts.environment !== input.environment ||
        facts.revision !== input.revision
      )
        throw new Error(
          "Trigger provider, environment or revision binding mismatch",
        )
      result.fragments.trigger = facts
      result.blockers.push(...facts.blockers)
    } catch {
      result.blockers.push({
        targetId: "jobs",
        reason: "trigger-fact-collection-failed",
      })
    }
  }
  recheckSource()
  return result
}

function parseJsonEnvironment<T>(
  name: string,
  maxBytes: number,
): T | undefined {
  const text = process.env[name]?.trim()
  if (!text) return undefined
  if (Buffer.byteLength(text) > maxBytes)
    throw new Error(`${name} exceeds its input size limit.`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${name} must contain valid JSON.`)
  }
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2)
    if (
      args.length !== 6 ||
      args[0] !== "--env" ||
      !["preview", "production"].includes(args[1]) ||
      args[2] !== "--repo" ||
      args[4] !== "--revision"
    )
      throw new Error(
        "Use release-collect --env preview|production --repo <candidate root> --revision <full SHA>.",
      )
    const environment = args[1] as Environment
    const previewDeploymentIds = parseJsonEnvironment<Record<string, string>>(
      "EWATRADE_RELEASE_PREVIEW_DEPLOYMENT_IDS_JSON",
      8 * 1024,
    )
    if (
      previewDeploymentIds &&
      (Object.keys(previewDeploymentIds).length !== WEB_TARGETS.length ||
        !WEB_TARGETS.every((target) => {
          const id = previewDeploymentIds[target.targetId]
          return (
            typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)
          )
        }))
    )
      throw new Error(
        "Preview deployment selectors must name every configured web target with a valid ID.",
      )
    const mobileSourceState = parseJsonEnvironment<ExpoSourceState>(
      "EWATRADE_RELEASE_MOBILE_SOURCE_STATE_JSON",
      64 * 1024,
    )
    const report = await collectReleaseFacts({
      environment,
      repository: args[3],
      revision: args[5],
      previewDeploymentIds,
      mobileSourceState,
      generateMobileSource:
        process.env.EWATRADE_RELEASE_GENERATE_MOBILE_SOURCE === "1",
      expoBaselineBuildIds: parseJsonEnvironment<
        Record<"android" | "ios", string>
      >("EWATRADE_EXPO_BASELINE_BUILD_IDS", 8 * 1024),
    })
    console.log(JSON.stringify(report))
    process.exitCode = 1
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Release fact collection failed.",
    )
    process.exitCode = 2
  }
}
