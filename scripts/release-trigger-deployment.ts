import { createHash } from "node:crypto"
import { type ProviderGet, providerRecord } from "./release-provider-http"

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const TASK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}$/
const SHA = /^[0-9a-f]{40}$/

export type TriggerWorkerObservation = {
  id: string
  version: string
  taskIds: string[]
}
export type TriggerActiveDeployment = {
  id: string
  version: string
  status: "DEPLOYED"
  completedAt: string
  workerId: string
  reportedContentHashDigest: string
  reportedRevision: string | null
  reportedRevisionMatchesCandidate: boolean
  sourceVerified: false
  configurationFingerprint: null
}

/** Normalizes logical task slugs; provider row identities stay internal. */
export function normalizeTriggerWorker(
  value: unknown,
): TriggerWorkerObservation {
  const worker = providerRecord(value)
  if (
    typeof worker.id !== "string" ||
    !ID.test(worker.id) ||
    typeof worker.version !== "string" ||
    !VERSION.test(worker.version) ||
    !Array.isArray(worker.tasks) ||
    worker.tasks.length > 2048
  )
    throw new Error("Trigger current worker response is malformed.")
  const rowIds = new Set<string>()
  const names = new Set<string>()
  const taskIds = worker.tasks.map((entry) => {
    const task = providerRecord(entry)
    if (
      typeof task.id !== "string" ||
      !task.id ||
      task.id.length > 256 ||
      Array.from(task.id).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      rowIds.has(task.id) ||
      typeof task.slug !== "string" ||
      !TASK.test(task.slug) ||
      names.has(task.slug)
    )
      throw new Error("Trigger current worker task metadata is malformed.")
    rowIds.add(task.id)
    names.add(task.slug)
    return task.slug
  })
  return { id: worker.id, version: worker.version, taskIds }
}

function timestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 35 ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    throw new Error("Trigger deployment completion timestamp is malformed.")
  const millis = Date.parse(value)
  const calendar = Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
  if (
    !Number.isFinite(millis) ||
    millis < 0 ||
    millis > Date.now() ||
    !Number.isFinite(calendar) ||
    new Date(calendar).toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    throw new Error("Trigger deployment completion timestamp is unverified.")
  return new Date(millis).toISOString()
}

function currentDeployment(value: unknown) {
  const record = providerRecord(value)
  if (
    typeof record.id !== "string" ||
    !ID.test(record.id) ||
    typeof record.version !== "string" ||
    !VERSION.test(record.version) ||
    record.status !== "DEPLOYED"
  )
    throw new Error("Trigger current deployment is unavailable or malformed.")
  const createdAt = timestamp(record.createdAt)
  const completedAt = timestamp(record.deployedAt)
  if (completedAt < createdAt)
    throw new Error("Trigger deployment completion predates creation.")
  return { id: record.id, version: record.version, createdAt, completedAt }
}

function equalWorker(
  left: TriggerWorkerObservation,
  right: TriggerWorkerObservation,
) {
  return (
    left.id === right.id &&
    left.version === right.version &&
    JSON.stringify([...left.taskIds].sort()) ===
      JSON.stringify([...right.taskIds].sort())
  )
}

/**
 * Uses the selected environment's named read credential. Pinned 4.5.16 SDK
 * retrieveCurrentDeployment and CLI getDeployment define these GET routes.
 * Provider Git/content hashes remain reported metadata, not artifact attestation.
 */
export async function collectTriggerActiveDeployment(input: {
  revision: string
  worker: TriggerWorkerObservation
  get: ProviderGet
  readCurrentWorker: () => Promise<TriggerWorkerObservation>
}): Promise<TriggerActiveDeployment> {
  if (!SHA.test(input.revision))
    throw new Error("Expected release revision is invalid.")
  const current = currentDeployment(
    await input.get("/api/v1/deployments/current"),
  )
  const detail = providerRecord(
    await input.get(`/api/v1/deployments/${current.id}`),
  )
  const worker = normalizeTriggerWorker(detail.worker)
  if (
    detail.id !== current.id ||
    detail.status !== "DEPLOYED" ||
    detail.version !== current.version ||
    worker.version !== current.version ||
    !equalWorker(input.worker, worker) ||
    typeof detail.contentHash !== "string" ||
    !detail.contentHash ||
    detail.contentHash === "-" ||
    detail.contentHash.length > 256 ||
    Array.from(detail.contentHash).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error(
      "Trigger active deployment and owned current worker do not match.",
    )
  if (
    detail.commitSHA !== undefined &&
    detail.commitSHA !== null &&
    (typeof detail.commitSHA !== "string" || !SHA.test(detail.commitSHA))
  )
    throw new Error("Trigger reported source revision is malformed.")
  const rechecked = currentDeployment(
    await input.get("/api/v1/deployments/current"),
  )
  const currentWorker = await input.readCurrentWorker()
  if (
    JSON.stringify(rechecked) !== JSON.stringify(current) ||
    !equalWorker(input.worker, currentWorker)
  )
    throw new Error("Trigger active deployment changed during observation.")
  const reportedRevision =
    typeof detail.commitSHA === "string" ? detail.commitSHA : null
  return {
    id: current.id,
    version: current.version,
    status: "DEPLOYED",
    completedAt: current.completedAt,
    workerId: worker.id,
    reportedContentHashDigest: createHash("sha256")
      .update("ewatrade:trigger:reported-content-hash:v1\0")
      .update(detail.contentHash)
      .digest("hex"),
    reportedRevision,
    reportedRevisionMatchesCandidate: reportedRevision === input.revision,
    sourceVerified: false,
    configurationFingerprint: null,
  }
}
