import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { EwaTradeProviderBundle } from "../.release/ewatrade-provider-bundle"
import {
  MOBILE_TARGET,
  WEB_TARGETS,
} from "../.release/ewatrade-provider-bundle"
import {
  mobileNativeDigest,
  validExpoFingerprint,
} from "./release-mobile-fingerprint"

/** Provider ownership must still be corroborated when the planner needs no action. */
export function assertProviderTargetBindings(bundle: EwaTradeProviderBundle) {
  for (const config of WEB_TARGETS) {
    const receipt = bundle.receipts
      .filter((item) => item.targetId === config.targetId)
      .sort((left, right) =>
        right.completedAt.localeCompare(left.completedAt),
      )[0]
    const id = bundle.vercel.deploymentIds[config.targetId]
    const deployment = bundle.vercel.deployments.find((item) => item.id === id)
    // Generic CLI metadata cannot authenticate the deployed source revision.
    const source = deployment?.gitSource?.sha
    if (
      !receipt ||
      !id ||
      receipt.deploymentId !== id ||
      !deployment ||
      deployment.projectId !== config.projectId ||
      deployment.readyState !== "READY" ||
      source !== receipt.revision ||
      (deployment.gitSource?.sha &&
        deployment.meta?.githubCommitSha &&
        deployment.gitSource.sha !== deployment.meta.githubCommitSha) ||
      (bundle.environment === "production"
        ? deployment.target !== "production"
        : ![null, "preview"].includes(deployment.target))
    )
      throw new Error(
        `${config.targetId}: current provider deployment ownership, source or environment is unverified.`,
      )
    if (bundle.environment === "production") {
      const alias = bundle.vercel.domains.find(
        (item) => item.domain === config.productionDomain,
      )?.assignment
      if (
        alias?.deploymentId !== id ||
        !Number.isFinite(Date.parse(alias.assignedAt))
      )
        throw new Error(
          `${config.targetId}: current Production alias is unverified.`,
        )
    }
  }
  const selected = MOBILE_TARGET[bundle.environment]
  const channel = bundle.expo.channels.find(
    (item) =>
      item.projectId === MOBILE_TARGET.projectId &&
      item.channel === selected.channel,
  )
  const receipt = bundle.receipts
    .filter((item) => item.targetId === "mobile")
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0]
  if (!receipt || channel?.branch !== selected.branch)
    throw new Error("Mobile current project/channel ownership is unverified.")
  for (const platform of MOBILE_TARGET.platforms) {
    const id =
      bundle.expo.newBuildIds[platform] ??
      bundle.expo.baselineBuildIds[platform]
    const build = bundle.expo.builds.find((item) => item.id === id)
    const fingerprint = bundle.expo.fingerprints[platform]
    const runtime = bundle.expo.runtimeVersions[platform]
    if (
      !validExpoFingerprint(fingerprint) ||
      !runtime ||
      !build ||
      build.projectId !== MOBILE_TARGET.projectId ||
      build.platform !== platform ||
      build.profile !== selected.profile ||
      build.channel !== selected.channel ||
      build.status !== "finished" ||
      build.availability !== "available" ||
      build.fingerprint !== fingerprint ||
      build.runtimeVersion !== runtime
    )
      throw new Error(
        `${platform}: current compatible mobile build is unverified.`,
      )
    const groupId = bundle.expo.updateGroupIds[platform]
    const update = groupId
      ? bundle.expo.updates.find(
          (item) => item.groupId === groupId && item.platform === platform,
        )
      : undefined
    if (
      groupId
        ? !update ||
          update.projectId !== MOBILE_TARGET.projectId ||
          update.channel !== selected.channel ||
          update.branch !== selected.branch ||
          update.status !== "published" ||
          update.rolloutPercentage !== 100 ||
          update.runtimeVersion !== runtime ||
          update.revision !== receipt.revision
        : build.revision !== receipt.revision
    )
      throw new Error(
        `${platform}: current mobile artifact source is unverified.`,
      )
  }
  if (
    bundle.fingerprints.mobile?.kind !== "native" ||
    bundle.fingerprints.mobile.value !==
      mobileNativeDigest({
        projectId: MOBILE_TARGET.projectId,
        environment: bundle.environment,
        ...selected,
        fingerprints: bundle.expo.fingerprints,
        runtimeVersions: bundle.expo.runtimeVersions,
      })
  )
    throw new Error(
      "Mobile receipt fingerprint does not bind both raw native platform fingerprints and runtimes.",
    )
}

/** Loaded exclusively from the trusted verifier checkout, never candidate code. */
export function releaseContract(trustedRoot: string, toolkitRevision: string) {
  const source = readFileSync(
    resolve(trustedRoot, ".release/policy.json"),
    "utf8",
  )
  const policy = JSON.parse(source)
  if (
    policy.version !== 1 ||
    policy.project !== "ewatrade" ||
    policy.database?.managedBy !== "local-infra-kit" ||
    policy.database?.releaseGate !== "excluded" ||
    policy.database?.development !== "db-push" ||
    policy.database?.preview !== "db-push" ||
    policy.database?.production !== "db-push" ||
    policy.database?.execution !== "local-then-selected-environment" ||
    policy.database?.confirmation !== "existing-interactive-prompts" ||
    policy.database?.automaticDataLossAcceptance !== false ||
    !Array.isArray(policy.scope) ||
    policy.scope.join(",") !==
      "api-web,dashboard-web,marketing-web,mobile,jobs" ||
    policy.verification?.candidateCodeExecution !== false ||
    policy.verification?.maximumEvidenceAgeSeconds !== 300 ||
    !/^[0-9a-f]{40}$/.test(toolkitRevision)
  )
    throw new Error("Trusted release policy is unsupported.")
  return {
    toolkitRevision,
    policyFingerprint: createHash("sha256").update(source).digest("hex"),
  }
}

export function assertBundleContract(
  bundle: Pick<EwaTradeProviderBundle, "toolkitRevision" | "policyFingerprint">,
  contract: ReturnType<typeof releaseContract>,
) {
  if (
    bundle.toolkitRevision !== contract.toolkitRevision ||
    bundle.policyFingerprint !== contract.policyFingerprint
  )
    throw new Error(
      "Signed provider evidence does not match the trusted toolkit and release policy.",
    )
}
