import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "@ewatrade/db"
import type { TenantErasureTarget } from "@ewatrade/private-media/tenant-object-erasure"
import { runTenantPhotoErasureTick } from "./tenant-photo-erasure"

type Steps = NonNullable<
  Parameters<typeof runTenantPhotoErasureTick>[0]["steps"]
>
const db = {} as PrismaClient
const target: TenantErasureTarget = {
  storageProvider: "vercel_blob_private",
  storageStoreId: "store_pinned",
  storagePath: "orders/attachments/t/o/a/x.jpg",
  dataClassification: "LIVE",
}

function fakeSteps(queue: number, stepBudget = 2) {
  const finished: Array<{ id: string; ok: boolean }> = []
  let remaining = queue
  let budget = stepBudget
  const steps: Steps = {
    listActive: async () => [{ id: "run" }],
    step: async () => ({
      status: "DELETING",
      progressed: budget-- > 0,
    }),
    claim: async () =>
      remaining-- > 0
        ? {
            id: `object-${remaining}`,
            leaseToken: "lease",
            attempts: 1,
            target,
          }
        : null,
    finish: async (_db, claim, result) => {
      finished.push({ id: claim.id, ok: result.ok })
      return { recorded: true, state: result.ok ? "DELETED" : "PENDING" }
    },
  }
  return { steps, finished }
}

describe("Tenant photo erasure job tick", () => {
  test("advances runs, deletes due objects and records each outcome", async () => {
    const { steps, finished } = fakeSteps(3)
    let calls = 0
    const result = await runTenantPhotoErasureTick({
      db,
      steps,
      deadline: Number.POSITIVE_INFINITY,
      erase: async () =>
        ++calls === 2
          ? { ok: false, code: "STORAGE_UNAVAILABLE" }
          : { ok: true },
    })
    expect(result).toEqual({ stepped: 2, deleted: 2, failed: 1 })
    expect(finished.map((row) => row.ok)).toEqual([true, false, true])
  })

  test("the deadline stops new provider calls; leases recover the rest", async () => {
    const { steps } = fakeSteps(5, 0)
    let clock = 0
    let erased = 0
    const result = await runTenantPhotoErasureTick({
      db,
      steps,
      deadline: 2,
      now: () => clock++,
      erase: async () => {
        erased++
        return { ok: true }
      },
    })
    expect(erased).toBeLessThan(5)
    expect(result.deleted).toBe(erased)
  })
})
