import {
  expireAssistantAttachment,
  failAbandonedAssistantRuns,
  listExpiredAssistantAttachments,
} from "@ewatrade/db/assistant-operations"
import { prisma } from "@ewatrade/db/client"
import {
  assistantAttachmentStoragePath,
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"

/** Bounded per run; the hourly cadence works through any backlog. */
export const ASSISTANT_MAINTENANCE_BATCH = 50

type ExpiredAttachment = Awaited<
  ReturnType<typeof listExpiredAssistantAttachments>
>[number]

export type AssistantMaintenanceDeps = {
  now: () => Date
  failAbandonedRuns: (now: Date) => Promise<{ failed: number }>
  listExpired: (now: Date, limit: number) => Promise<ExpiredAttachment[]>
  removeBytes: (attachment: ExpiredAttachment) => Promise<void>
  expire: (attachment: ExpiredAttachment) => Promise<"deleted" | "cleared">
}

export function defaultAssistantMaintenanceDeps(): AssistantMaintenanceDeps {
  return {
    now: () => new Date(),
    failAbandonedRuns: async (now) => {
      const expiredAttempts =
        await prisma.assistantTranscriptionAttempt.findMany({
          where: {
            startedAt: { lt: new Date(now.getTime() - 90 * 86400_000) },
          },
          take: 500,
          select: { id: true },
        })
      if (expiredAttempts.length)
        await prisma.assistantTranscriptionAttempt.deleteMany({
          where: { id: { in: expiredAttempts.map((row) => row.id) } },
        })
      return failAbandonedAssistantRuns(prisma, { now })
    },
    listExpired: (now, limit) =>
      listExpiredAssistantAttachments(prisma, { now, limit }),
    removeBytes: async (attachment) => {
      const classification = attachment.dataClassification
      const config = resolveAssistantAttachmentStorage(classification)
      const target = {
        tenantId: attachment.tenantId,
        conversationId: attachment.conversationId,
        attachmentId: attachment.id,
        contentDigest: attachment.contentDigest,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
      }
      if (
        !attachment.storagePath ||
        attachment.storageProvider !== config.provider ||
        attachment.storageStoreId !== config.storeId ||
        attachment.storagePath !== assistantAttachmentStoragePath(target)
      )
        throw new PrivateObjectStorageError("INVALID_OBJECT")
      const storage = createAssistantAttachmentStorage(config, classification)
      await storage.remove({ target })
      try {
        await storage.read({ target })
      } catch (error) {
        if (
          error instanceof PrivateObjectStorageError &&
          error.code === "OBJECT_NOT_FOUND"
        )
          return
        throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      }
      throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
    },
    expire: (attachment) => expireAssistantAttachment(prisma, attachment),
  }
}

/**
 * Hourly: closes runs a crashed process left RUNNING, and enforces attachment
 * retention (stored bytes deleted first, then the row is cleared or removed).
 * Every stored attachment, including actual QA test bytes, retains attribution
 * until its original object's absence is confirmed.
 */
export async function assistantMaintenanceHandler(
  deps: AssistantMaintenanceDeps = defaultAssistantMaintenanceDeps(),
) {
  const now = deps.now()
  const { failed: abandonedRuns } = await deps.failAbandonedRuns(now)
  const expired = await deps.listExpired(now, ASSISTANT_MAINTENANCE_BATCH)
  let deleted = 0
  let cleared = 0
  let kept = 0
  for (const attachment of expired) {
    if (
      !attachment.storagePath &&
      (attachment.storageProvider || attachment.storageStoreId)
    ) {
      kept += 1
      continue
    }
    if (attachment.storagePath) {
      try {
        await deps.removeBytes(attachment)
      } catch (error) {
        kept += 1
        console.error("[assistant-maintenance] bytes not deleted", {
          attachmentId: attachment.id,
          name: error instanceof Error ? error.name : typeof error,
        })
        continue
      }
    }
    const result = await deps.expire(attachment)
    if (result === "deleted") deleted += 1
    else cleared += 1
  }
  return { abandonedRuns, deleted, cleared, kept }
}
