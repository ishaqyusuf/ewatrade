import { JOBS_TARGET } from "../.release/ewatrade-provider-bundle"
import {
  type ProviderGet,
  providerGetClient,
  providerRecord,
} from "./release-provider-http"
import {
  type TriggerActiveDeployment,
  type TriggerWorkerObservation,
  collectTriggerActiveDeployment,
  normalizeTriggerWorker,
} from "./release-trigger-deployment"
import { EWATRADE_TRIGGER_TARGET } from "./release-trigger-target"

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const PROJECT_REF = /^proj_[A-Za-z0-9]+$/
const SHA = /^[0-9a-f]{40}$/

export type TriggerCollection = {
  provider: "trigger"
  environment: "preview" | "production"
  revision: string
  observedAt: string
  project: {
    projectRef: string
    projectId: string
    organizationId: string
  } | null
  environmentIdentity: null
  currentWorker: TriggerWorkerObservation | null
  activeDeployment: TriggerActiveDeployment | null
  blockers: Array<{ targetId: "jobs"; reason: string }>
  releaseReady: false
}

/**
 * Read-only Trigger facts. Endpoint paths and method signatures follow
 * Trigger's pinned CLI API client: https://github.com/triggerdotdev/trigger.dev/blob/v4.5.16/packages/cli-v3/src/apiClient.ts
 * (`getProject` and `getWorkerByTag`). The project response confirms ownership;
 * current/detail deployment reads use a separate selected-environment key.
 * Reported Git/content metadata never establishes source or effective config
 * authority, and unknown environment identity remains explicitly unverified.
 */
export async function collectTriggerFacts(input: {
  environment: "preview" | "production"
  revision: string
  expectedOrganizationId?: string
  expectedProjectId?: string
  get?: ProviderGet
  environmentGet?: ProviderGet
}): Promise<TriggerCollection> {
  const expectedOrganizationId =
    input.expectedOrganizationId ?? EWATRADE_TRIGGER_TARGET.organizationId
  if (input.environment !== "preview" && input.environment !== "production")
    throw new Error("Choose a release environment.")
  if (!SHA.test(input.revision))
    throw new Error("Expected release revision is invalid.")
  if (!SAFE_ID.test(expectedOrganizationId))
    throw new Error("Expected Trigger organization ID is required.")
  if (input.expectedProjectId && !SAFE_ID.test(input.expectedProjectId))
    throw new Error("Expected Trigger project ID is invalid.")

  const result: TriggerCollection = {
    provider: "trigger",
    environment: input.environment,
    revision: input.revision,
    observedAt: new Date().toISOString(),
    project: null,
    environmentIdentity: null,
    currentWorker: null,
    activeDeployment: null,
    blockers: [],
    releaseReady: false,
  }

  if (input.environment === "preview") {
    result.blockers.push({
      targetId: "jobs",
      reason:
        "preview-environment-isolation-unverified; isolated waiver required",
    })
    return result
  }

  const get =
    input.get ??
    providerGetClient("trigger", process.env.TRIGGER_ACCESS_TOKEN ?? "")

  const projectRef = JOBS_TARGET.projectRef
  if (!PROJECT_REF.test(projectRef))
    throw new Error("Configured Trigger project reference is invalid.")
  const project = providerRecord(await get(`/api/v1/projects/${projectRef}`))
  const organization = providerRecord(project.organization)
  const projectId = project.id
  const organizationId = organization.id
  const referenceMatches = project.externalRef === projectRef
  if (
    typeof projectId !== "string" ||
    !SAFE_ID.test(projectId) ||
    (input.expectedProjectId && projectId !== input.expectedProjectId) ||
    organizationId !== expectedOrganizationId ||
    !referenceMatches
  )
    throw new Error("Trigger project or organization ownership mismatch.")
  result.project = { projectRef, projectId, organizationId }

  const readCurrentWorker = async () =>
    normalizeTriggerWorker(
      providerRecord(
        await get(`/api/v1/projects/${projectRef}/prod/workers/current`),
      ).worker,
    )
  result.currentWorker = await readCurrentWorker()
  let environmentGet = input.environmentGet
  if (!environmentGet) {
    const key = process.env.TRIGGER_RELEASE_READ_KEY ?? ""
    if (/^tr_prod_sk_[A-Za-z0-9_-]{1,512}$/.test(key))
      environmentGet = providerGetClient("trigger", key)
    else
      result.blockers.push({
        targetId: "jobs",
        reason: "trigger-selected-environment-read-credential-unavailable",
      })
  }
  if (environmentGet) {
    try {
      result.activeDeployment = await collectTriggerActiveDeployment({
        revision: input.revision,
        worker: result.currentWorker,
        get: environmentGet,
        readCurrentWorker,
      })
      if (!result.activeDeployment.reportedRevisionMatchesCandidate)
        result.blockers.push({
          targetId: "jobs",
          reason: "trigger-reported-deployment-revision-missing-or-different",
        })
      result.blockers.push({
        targetId: "jobs",
        reason: "trigger-deployment-source-artifact-binding-unverified",
      })
    } catch {
      result.blockers.push({
        targetId: "jobs",
        reason: "trigger-active-deployment-unverified",
      })
    }
  }
  result.observedAt = new Date().toISOString()
  result.blockers.push(
    {
      targetId: "jobs",
      reason:
        "trigger-current-worker-does-not-prove-protected-environment-identity",
    },
    {
      targetId: "jobs",
      reason:
        "trigger-current-worker-source-sha-and-deploy-config-attribution-unavailable",
    },
  )
  return result
}
