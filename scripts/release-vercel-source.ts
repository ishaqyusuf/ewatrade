import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import {
  assertReleaseRevision,
  assertTrustedTopology,
  committedManifest,
  committedSourceFingerprints,
  dirtyReleaseInputs,
  releaseGit,
} from "./release-source"
import type { VercelCollection } from "./release-vercel-collect"

const SHA = /^[0-9a-f]{40}$/
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const ROOTS: Record<string, string> = {
  "dashboard-web": "apps/dashboard",
  "api-web": "apps/api",
  "marketing-web": "apps/marketing",
}

export type VercelSourceBinding = {
  targetId: string
  candidateRevision: string
  candidateSourceFingerprint: string
  deploymentId: string | null
  providerRevision: string | null
  providerSourceFingerprint: string | null
  compatible: boolean
  reason: string | null
}

/** Unsigned Git source corroboration, not deployment/configuration attestation. */
export function bindVercelSource(input: {
  repository: string
  revision: string
  environment: "preview" | "production"
  collection: VercelCollection
}): VercelSourceBinding[] {
  const repository = assertReleaseRevision(input.repository, input.revision)
  const manifest = committedManifest(repository, input.revision)
  assertTrustedTopology(
    manifest,
    JSON.parse(
      readFileSync(
        resolve(import.meta.dir, "../release.manifest.json"),
        "utf8",
      ),
    ),
  )
  if (dirtyReleaseInputs(repository, manifest).length)
    throw new Error(
      "Vercel source binding requires clean committed release inputs.",
    )
  const webManifest = {
    ...manifest,
    targets: manifest.targets.filter((target) =>
      WEB_TARGETS.some((config) => config.targetId === target.id),
    ),
  }
  const candidate = committedSourceFingerprints(
    repository,
    input.revision,
    webManifest,
  )
  const observed = new Map<string, Record<string, string> | null>()
  const facts = input.collection
  if (
    !["preview", "production"].includes(input.environment) ||
    facts.provider !== "vercel" ||
    facts.environment !== input.environment
  )
    throw new Error(
      "Vercel source binding requires its expected provider and release environment.",
    )

  return WEB_TARGETS.map((config) => {
    if (!candidate[config.targetId])
      throw new Error("Vercel source binding requires every owned web target.")
    const id = facts.deploymentIds[config.targetId]
    const projects = facts.projects.filter(
      (project) => project.targetId === config.targetId,
    )
    const deployments = facts.deployments.filter((item) => item.id === id)
    const deployment = deployments[0]
    const result: VercelSourceBinding = {
      targetId: config.targetId,
      candidateRevision: input.revision,
      candidateSourceFingerprint: candidate[config.targetId],
      deploymentId: typeof id === "string" && ID.test(id) ? id : null,
      providerRevision: null,
      providerSourceFingerprint: null,
      compatible: false,
      reason: "provider-deployment-binding-invalid",
    }
    if (
      !result.deploymentId ||
      projects.length !== 1 ||
      projects[0].projectId !== config.projectId ||
      projects[0].teamId !== config.teamId ||
      projects[0].rootDirectory !== ROOTS[config.targetId] ||
      deployments.length !== 1 ||
      deployment.projectId !== config.projectId ||
      deployment.readyState !== "READY" ||
      (facts.environment === "production"
        ? deployment.target !== "production"
        : ![null, "preview"].includes(deployment.target))
    )
      return result

    const source = deployment.gitSource?.sha
    if (typeof source !== "string" || !SHA.test(source)) {
      result.reason = "provider-git-source-unavailable"
      return result
    }
    result.providerRevision = source
    const descriptive = deployment.meta?.githubCommitSha
    if (descriptive !== undefined && descriptive !== source) {
      result.reason = "provider-git-source-conflict"
      return result
    }
    if (!observed.has(source)) {
      try {
        if (releaseGit(repository, ["cat-file", "-t", source]) !== "commit")
          throw new Error("Source is not a commit.")
        releaseGit(repository, [
          "merge-base",
          "--is-ancestor",
          source,
          input.revision,
        ])
        observed.set(
          source,
          committedSourceFingerprints(repository, source, webManifest),
        )
      } catch {
        observed.set(source, null)
      }
    }
    const fingerprint = observed.get(source)?.[config.targetId]
    if (!fingerprint) {
      result.reason = "provider-git-source-not-ancestor-or-unavailable"
      return result
    }
    result.providerSourceFingerprint = fingerprint
    if (fingerprint !== result.candidateSourceFingerprint) {
      result.reason = "provider-target-source-changed"
      return result
    }
    result.compatible = true
    result.reason = null
    return result
  })
}
