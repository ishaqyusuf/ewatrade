import { SETUP_ATTACHMENT_MAX_ATTEMPTS } from "@ewatrade/assistant/setup/attachment-processing"
import { assistantAttachmentProcessHandler } from "./handlers/assistant-attachment-process"
import { triggerJob } from "./trigger"

/**
 * Trigger.dev runs it where configured; otherwise it runs in this process in
 * the background (local development). The upload response never waits for it.
 */
export async function enqueueAssistantAttachmentProcessing(
  attachmentId: string,
  analyticsOrigin?: string,
) {
  await triggerJob(
    "assistant.attachment.process",
    assistantAttachmentProcessHandler,
    { attachmentId, analyticsOrigin },
    { maxAttempts: SETUP_ATTACHMENT_MAX_ATTEMPTS, baseDelayMs: 1_500 },
  )
}
