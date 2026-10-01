import { expect, test } from "bun:test"
import { runPrescriptionRetention } from "./prescription-retention"

function batch(media: Array<{ id: string; objectKey: string }>) {
  return {
    addressIds: ["address-1"],
    auditRequestEventIds: [],
    auditSensitiveAccessEventIds: [],
    auditStoreEventIds: [],
    commercialOrderIds: [],
    commercialRequestIds: [],
    media,
    messageIds: [],
    storeId: "store-1",
    tenantId: "tenant-1",
    tokenRequestIds: [],
    transcriptIds: [],
  }
}

test("prescription retention completes non-media work without loading an unavailable media provider", async () => {
  const completed: unknown[] = []
  await runPrescriptionRetention({
    claim: async () => batch([]) as never,
    complete: async (input) => {
      completed.push(input)
    },
    getMedia: () => {
      throw new Error("production media provider unavailable")
    },
    listStores: async () => [{ storeId: "store-1", tenantId: "tenant-1" }],
  })
  expect(completed).toEqual([
    expect.objectContaining({ addressIds: ["address-1"], mediaIds: [] }),
  ])
})

test("prescription retention fails before completion when media needs an unavailable provider", async () => {
  let completed = false
  await expect(
    runPrescriptionRetention({
      claim: async () =>
        batch([{ id: "media-1", objectKey: "private/media-1" }]) as never,
      complete: async () => {
        completed = true
      },
      getMedia: () => {
        throw new Error("production media provider unavailable")
      },
      listStores: async () => [{ storeId: "store-1", tenantId: "tenant-1" }],
    }),
  ).rejects.toThrow("production media provider unavailable")
  expect(completed).toBe(false)
})
