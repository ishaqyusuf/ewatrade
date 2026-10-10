import {
  expireAssistantAttachment,
  failAbandonedAssistantRuns,
  listExpiredAssistantAttachments,
} from "@ewatrade/db/assistant-operations"
import { prisma } from "@ewatrade/db/client"
import {
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"

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
      const storage = createAssistantAttachmentStorage(
        resolveAssistantAttachmentStorage(classification),
        classification,
      )
      await storage.remove({
        target: {
          tenantId: attachment.tenantId,
          conversationId: attachment.conversationId,
          attachmentId: attachment.id,
          contentDigest: attachment.contentDigest,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
        },
      })
    },
    expire: (attachment) => expireAssistantAttachment(prisma, attachment),
  }
}

/**
 * Hourly: closes runs a crashed process left RUNNING, and enforces attachment
 * retention (stored bytes deleted first, then the row is cleared or removed).
 * A live attachment whose bytes cannot be deleted stays for the next run; QA
 * data never had live storage, so its row is expired regardless.
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
    if (attachment.storagePath) {
      try {
        await deps.removeBytes(attachment)
      } catch (error) {
        if (attachment.dataClassification !== "QA") {
          kept += 1
          console.error("[assistant-maintenance] bytes not deleted", {
            attachmentId: attachment.id,
            name: error instanceof Error ? error.name : typeof error,
          })
          continue
        }
      }
    }
    const result = await deps.expire(attachment)
    if (result === "deleted") deleted += 1
    else cleared += 1
  }
  return { abandonedRuns, deleted, cleared, kept }
}
