import { expect, mock, test } from "bun:test"
import {
  claimAssistantAttachmentProcessing,
  completeAssistantAttachmentProcessing,
  listAssistantAttachmentsToProcess,
} from "./assistant-attachments"
import { listExpiredAssistantAttachments } from "./assistant-operations"

test("attachment claim, recovery and completion enforce the same current retention boundary", async () => {
  const now = new Date("2026-10-15T12:00:00Z")
  const updateMany = mock(async (_input: unknown) => ({ count: 0 }))
  const findUnique = mock(async () => null)
  const findMany = mock(async (_input: unknown) => [])
  const db = { assistantAttachment: { updateMany, findUnique, findMany } }
  expect(
    await claimAssistantAttachmentProcessing(db as never, {
      attachmentId: "audio",
      leaseMs: 60_000,
      maxAttempts: 3,
      now,
    }),
  ).toBeNull()
  expect(findUnique).not.toHaveBeenCalled()
  expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
    where: { retentionUntil: { gt: now }, conversation: { status: "ACTIVE" } },
  })
  await listAssistantAttachmentsToProcess(db as never, { maxAttempts: 3, now })
  expect(findMany.mock.calls[0]?.[0]).toMatchObject({
    where: { retentionUntil: { gt: now } },
  })
  expect(
    await completeAssistantAttachmentProcessing(db as never, {
      attachmentId: "audio",
      generation: 1,
      transcript: "Late result",
      extraction: { type: "transcript" },
      now,
    }),
  ).toBe(false)
  expect(updateMany.mock.calls[1]?.[0]).toMatchObject({
    where: { retentionUntil: { gt: now }, processingAttempts: 1 },
  })
})

test("retention candidates retain original private provider, Store and path ownership", async () => {
  const findMany = mock(async (_input: unknown) => [])
  await listExpiredAssistantAttachments(
    {
      assistantAttachment: { findMany },
      tenant: { findMany: async () => [] },
    } as never,
    { now: new Date(), limit: 5 },
  )
  expect(findMany.mock.calls[0]?.[0]).toMatchObject({
    select: { storageProvider: true, storageStoreId: true, storagePath: true },
  })
})
