import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import type { VercelDeploymentMetadata } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/vercel"
import {
  type ProviderGet,
  providerGetClient,
  providerRecord,
} from "./release-provider-http"

const ROOTS: Record<string, string> = {
  "dashboard-web": "apps/dashboard",
  "api-web": "apps/api",
  "marketing-web": "apps/marketing",
}
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SHA = /^[0-9a-f]{40}$/

type AliasObservation = {
  domain: string
  deploymentId: string
  observedAt: string
  providerUpdatedAt: string | null
}
export type VercelCollection = {
  provider: "vercel"
  environment: "preview" | "production"
  observedAt: string
  projects: Array<{
    targetId: string
    projectId: string
    teamId: string
    rootDirectory: string
  }>
  deploymentIds: Record<string, string>
  deployments: VercelDeploymentMetadata[]
  deploymentLifecycles: Array<{
    targetId: string
    deploymentId: string
    createdAt: string | null
    completedAt: string | null
  }>
  aliases: AliasObservation[]
  blockers: Array<{ targetId: string; reason: string }>
  releaseReady: false
}

function timestamp(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > Date.now()
  )
    return null
  return new Date(value).toISOString()
}

function normalizeDeployment(
  value: unknown,
  expectedId: string,
  projectId: string,
  teamId: string,
  environment: "preview" | "production",
) {
  const record = providerRecord(value)
  const project = record.projectId ?? providerRecord(record.project).id
  if (
    record.id !== expectedId ||
    project !== projectId ||
    (record.ownerId !== undefined && record.ownerId !== teamId) ||
    (record.team !== undefined && providerRecord(record.team).id !== teamId) ||
    record.readyState !== "READY" ||
    (environment === "production"
      ? record.target !== "production"
      : record.target !== null)
  )
    throw new Error(
      "Vercel deployment does not match its owned Ready environment.",
    )
  if (
    typeof record.url !== "string" ||
    record.url.length > 253 ||
    !/^[a-z0-9.-]+\.vercel\.app$/.test(record.url)
  )
    throw new Error("Vercel immutable deployment URL is invalid.")
  const source = record.gitSource
    ? providerRecord(record.gitSource).sha
    : undefined
  const meta = record.meta
    ? providerRecord(record.meta).githubCommitSha
    : undefined
  if (
    (source !== undefined &&
      (typeof source !== "string" || !SHA.test(source))) ||
    (meta !== undefined && (typeof meta !== "string" || !SHA.test(meta))) ||
    (source && meta && source !== meta)
  )
    throw new Error(
      "Vercel deployment source attribution conflicts or is malformed.",
    )
  const createdAt = timestamp(record.createdAt)
  const readyAt = timestamp(record.ready)
  // Owner response ready is a provider lifecycle timestamp. A current project
  // response or our observation clock cannot supply an absent completion time.
  const completedAt =
    record.ownerId === teamId && createdAt && readyAt && readyAt >= createdAt
      ? readyAt
      : null
  return {
    lifecycle: { createdAt, completedAt },
    deployment: {
      id: expectedId,
      projectId,
      readyState: "READY",
      target: record.target as string | null,
      url: record.url,
      ...(source ? { gitSource: { sha: source as string } } : {}),
      ...(meta ? { meta: { githubCommitSha: meta as string } } : {}),
      ...(typeof record.readySubstate === "string"
        ? { readySubstate: record.readySubstate }
        : {}),
    } satisfies VercelDeploymentMetadata,
    // CLI --meta is caller-supplied descriptive data, not source provenance.
    // Retain it only for conflict detection; missing Git source needs an actual
    // trusted deploy-time artifact receipt, which this reader cannot reconstruct.
    sourceVerified: Boolean(source),
  }
}

/** Authenticated provider facts only. This fragment cannot sign or declare release readiness. */
export async function collectVercelFacts(input: {
  environment: "preview" | "production"
  previewDeploymentIds?: Record<string, string>
  get?: ProviderGet
}): Promise<VercelCollection> {
  const get =
    input.get ?? providerGetClient("vercel", process.env.VERCEL_TOKEN ?? "")
  if (!["preview", "production"].includes(input.environment))
    throw new Error("Choose a release environment.")
  const collection: VercelCollection = {
    provider: "vercel",
    environment: input.environment,
    observedAt: new Date().toISOString(),
    projects: [],
    deploymentIds: {},
    deployments: [],
    deploymentLifecycles: [],
    aliases: [],
    blockers: [],
    releaseReady: false,
  }
  for (const target of WEB_TARGETS) {
    if (!target.teamId)
      throw new Error("Vercel team ownership must be configured.")
    const query = { teamId: target.teamId }
    const project = providerRecord(
      await get(`/v9/projects/${target.projectId}`, query),
    )
    if (
      project.id !== target.projectId ||
      project.accountId !== target.teamId ||
      project.rootDirectory !== ROOTS[target.targetId]
    )
      throw new Error(
        `${target.targetId}: Vercel project/team/root ownership mismatch.`,
      )
    collection.projects.push({
      targetId: target.targetId,
      projectId: target.projectId,
      teamId: target.teamId,
      rootDirectory: ROOTS[target.targetId],
    })
    let id = input.previewDeploymentIds?.[target.targetId]
    if (input.environment === "production") {
      const alias = providerRecord(
        await get(`/v4/aliases/${target.productionDomain}`, {
          ...query,
          projectId: target.projectId,
        }),
      )
      if (
        alias.alias !== target.productionDomain ||
        alias.projectId !== target.projectId ||
        typeof alias.deploymentId !== "string" ||
        alias.deletedAt != null ||
        alias.redirect != null
      )
        throw new Error(
          `${target.targetId}: active Production alias ownership mismatch.`,
        )
      id = alias.deploymentId
      collection.aliases.push({
        domain: target.productionDomain ?? "",
        deploymentId: id,
        observedAt: collection.observedAt,
        providerUpdatedAt: timestamp(alias.updatedAt),
      })
      // Alias updatedAt can include unrelated changes. It does not establish promotion time.
      collection.blockers.push({
        targetId: target.targetId,
        reason: "promotion-assignment-time-unverified",
      })
    }
    if (!id || !ID.test(id))
      throw new Error(
        `${target.targetId}: exact provider deployment ID is required.`,
      )
    const { deployment, lifecycle, sourceVerified } = normalizeDeployment(
      await get(`/v13/deployments/${id}`, {
        ...query,
        withGitRepoInfo: "true",
      }),
      id,
      target.projectId,
      target.teamId,
      input.environment,
    )
    collection.deploymentIds[target.targetId] = id
    collection.deployments.push(deployment)
    collection.deploymentLifecycles.push({
      targetId: target.targetId,
      deploymentId: id,
      ...lifecycle,
    })
    if (!lifecycle.completedAt)
      collection.blockers.push({
        targetId: target.targetId,
        reason: "deployment-completion-time-unverified",
      })
    if (input.environment === "production") {
      const finalAlias = providerRecord(
        await get(`/v4/aliases/${target.productionDomain}`, {
          ...query,
          projectId: target.projectId,
        }),
      )
      if (
        finalAlias.alias !== target.productionDomain ||
        finalAlias.projectId !== target.projectId ||
        finalAlias.deploymentId !== id ||
        finalAlias.deletedAt != null ||
        finalAlias.redirect != null
      )
        throw new Error("Vercel Production alias changed during collection.")
    }
    if (!sourceVerified)
      collection.blockers.push({
        targetId: target.targetId,
        reason: "immutable-cli-source-attribution-missing",
      })
  }
  collection.observedAt = new Date().toISOString()
  return collection
}
