import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

const createCaller = createCallerFactory(ordersRouter)

test("direct target and confirm requests recheck Free before storage access", async () => {
  const reads: unknown[] = []
  let planReads = 0
  let promotions = 0
  const db = {
    commercialOrderAttachment: {
      async findFirst(query: unknown) {
        reads.push(query)
        return {
          id: "attachment-a",
          tenantId: "tenant-a",
          orderId: "order-a",
          status: "PENDING_UPLOAD",
          uploadExpiresAt: new Date(Date.now() + 60_000),
          kind: "VIDEO",
          contentType: "video/mp4",
          contentDigest: "a".repeat(64),
          sizeBytes: 64,
        }
      },
      async updateMany() {
        promotions += 1
        throw new Error("A denied upload must not promote")
      },
    },
    tenant: {
      async findUniqueOrThrow(query: unknown) {
        planReads += 1
        expect(query).toMatchObject({ where: { id: "tenant-a" } })
        return { metadata: null, subscription: { plan: { key: "free" } } }
      },
    },
  }
  const caller = createCaller({
    db,
    requestId: "test-request",
    session: {
      session: { id: "session-a", token: "test-token" },
      user: { id: "actor-a" },
    },
    tenantContext: {
      // Cached paid plan deliberately disagrees with the fresh server read.
      tenant: {
        id: "tenant-a",
        qaPurgeStartedAt: null,
        retailOpsPlanId: "pro",
        dataClassification: "INVALID_STORAGE_PROFILE",
      },
      membership: { id: "membership-a", role: "OWNER" },
      activeStore: { id: "store-a" },
      stores: [{ id: "store-a" }],
    },
  } as never)
  for (const method of [
    caller.activity.uploadTarget,
    caller.activity.confirmUpload,
  ])
    await expect(
      method({ attachmentId: "attachment-a" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Upgrade from Free to attach photos, videos and documents.",
    })
  expect(planReads).toBe(2)
  expect(promotions).toBe(0)
  expect(reads).toHaveLength(2)
  for (const query of reads)
    expect(query).toMatchObject({
      where: { id: "attachment-a", tenantId: "tenant-a" },
    })
})
