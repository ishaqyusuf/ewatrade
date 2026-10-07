import { SETUP_ATTACHMENT_MAX_ATTEMPTS } from "@ewatrade/assistant/setup/attachment-processing"
import { listAssistantAttachmentsToProcess } from "@ewatrade/db/assistant-attachments"
import { prisma } from "@ewatrade/db/client"
import { task } from "@trigger.dev/sdk/v3"
import {
  type AssistantAttachmentProcessPayload,
  assistantAttachmentProcessHandler,
} from "../handlers/assistant-attachment-process"

const queue = { name: "assistant-attachment-process", concurrencyLimit: 4 }

export const assistantAttachmentProcess = task({
  id: "assistant.attachment.process",
  maxDuration: 180,
  queue,
  // The attempt counter and lease on the row bound retries, including crashes.
  retry: { maxAttempts: SETUP_ATTACHMENT_MAX_ATTEMPTS },
  run: (payload: AssistantAttachmentProcessPayload) =>
    assistantAttachmentProcessHandler(payload),
})

/**
 * Picks up uploads whose dispatch was lost or whose worker crashed. Started
 * every minute by the shared cadence schedule.
 */
export const assistantAttachmentProcessRecovery = task({
  id: "assistant.attachment.process-recovery",
  maxDuration: 300,
  queue,
  run: async () => {
    const pending = await listAssistantAttachmentsToProcess(prisma, {
      maxAttempts: SETUP_ATTACHMENT_MAX_ATTEMPTS,
      limit: 10,
    })
    for (const { id } of pending) {
      try {
        await assistantAttachmentProcessHandler({ attachmentId: id })
      } catch {
        // One failing attachment cannot starve the bounded batch.
      }
    }
    return { attempted: pending.length }
  },
})
