import { describe, expect, mock, test } from "bun:test"
import {
  type AssistantMaintenanceDeps,
  assistantMaintenanceHandler,
} from "./assistant-maintenance"

type Expired = Awaited<
  ReturnType<AssistantMaintenanceDeps["listExpired"]>
>[number]

const attachment = (id: string, facts: Partial<Expired> = {}): Expired => ({
  id,
  tenantId: "tenant_1",
  conversationId: "conv_1",
  messageId: "msg_1",
  contentDigest: "a".repeat(64),
  contentType: "image/png",
  sizeBytes: 1024,
  fileName: "record-book.png",
  storagePath: `assistant/attachments/${id}.png`,
  storageProvider: "vercel_blob_private",
  storageStoreId: "original-store",
  dataClassification: "LIVE",
  ...facts,
})

function deps(
  expired: Expired[],
  overrides: Partial<AssistantMaintenanceDeps> = {},
) {
  return {
    now: () => new Date("2026-11-07T10:00:00.000Z"),
    failAbandonedRuns: mock(async () => ({ failed: 2 })),
    listExpired: mock(async () => expired),
    removeBytes: mock(async () => undefined),
    expire: mock(async (row: Expired) =>
      row.messageId ? ("cleared" as const) : ("deleted" as const),
    ),
    ...overrides,
  } satisfies AssistantMaintenanceDeps
}

describe("assistant maintenance", () => {
  test("closes abandoned runs and expires sent and unsent files after deleting bytes", async () => {
    const d = deps([
      attachment("sent"),
      attachment("unsent", { messageId: null }),
      attachment("never-uploaded", {
        messageId: null,
        storagePath: null,
        storageProvider: null,
        storageStoreId: null,
      }),
    ])
    const result = await assistantMaintenanceHandler(d)
    expect(result).toEqual({
      abandonedRuns: 2,
      deleted: 2,
      cleared: 1,
      kept: 0,
    })
    // Bytes go first, and only where bytes were stored.
    expect(d.removeBytes).toHaveBeenCalledTimes(2)
    expect(d.expire).toHaveBeenCalledTimes(3)
  })

  test("a live file whose bytes cannot be deleted is kept for the next run", async () => {
    const d = deps([attachment("live")], {
      removeBytes: mock(async () => {
        throw new Error("Blob unavailable")
      }),
    })
    const result = await assistantMaintenanceHandler(d)
    expect(result).toMatchObject({ kept: 1, cleared: 0, deleted: 0 })
    expect(d.expire).not.toHaveBeenCalled()
  })

  test("QA bytes retain canonical attribution when removal fails, just like LIVE bytes", async () => {
    const d = deps([attachment("qa", { dataClassification: "QA" })], {
      removeBytes: mock(async () => {
        throw new Error("QA storage is refused in production")
      }),
    })
    const result = await assistantMaintenanceHandler(d)
    expect(result).toMatchObject({ kept: 1, cleared: 0, deleted: 0 })
    expect(d.expire).not.toHaveBeenCalled()
  })

  test("incomplete stored-object attribution cannot be erased as an unused upload intent", async () => {
    const d = deps([attachment("missing-path", { storagePath: null })])
    expect(await assistantMaintenanceHandler(d)).toMatchObject({
      kept: 1,
      cleared: 0,
      deleted: 0,
    })
    expect(d.expire).not.toHaveBeenCalled()
    expect(d.removeBytes).not.toHaveBeenCalled()
  })
})
