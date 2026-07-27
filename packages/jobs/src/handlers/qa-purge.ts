import { prisma } from "@ewatrade/db"
import {
  type QaPurgeCounts,
  beginQaPurge,
  deleteQaTenant,
  finishQaPurge,
  getQaPurgeRun,
} from "@ewatrade/db/queries"

export type QaPurgePayload = { runId: string }

const emptyCounts = (): QaPurgeCounts => ({
  fileBytes: 0,
  files: 0,
  memberships: 0,
  stores: 0,
  tenants: 0,
  users: 0,
})

export async function qaPurgeHandler(
  payload: QaPurgePayload,
  _attempt: number,
) {
  const run = await getQaPurgeRun(prisma, payload.runId)
  if (!run || run.status !== "QUEUED") return

  const preview = await beginQaPurge(prisma, payload.runId)
  const deleted = emptyCounts()
  const errors: string[] = []

  for (const tenant of preview.tenants) {
    try {
      await deleteQaTenant(prisma, tenant.id)
      deleted.tenants += 1
    } catch (error) {
      errors.push(error instanceof Error ? error.name : "unknown_error")
    }
  }

  await finishQaPurge(prisma, {
    counts:
      deleted.tenants === preview.tenants.length ? preview.counts : deleted,
    errorCategory: errors[0],
    runId: payload.runId,
    status:
      deleted.tenants === preview.tenants.length
        ? "COMPLETED"
        : deleted.tenants
          ? "PARTIALLY_COMPLETED"
          : "FAILED",
  })
}
