import { describeSetupAttachmentError } from "@ewatrade/assistant/setup/attachment-processing"
import {
  SETUP_ATTACHMENTS_PER_CONVERSATION,
  SETUP_ATTACHMENT_RETENTION_MS,
  SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
  type SetupAttachmentExtraction,
  sanitizeSetupAttachmentName,
  setupAttachmentExtractionSchema,
  summarizeSetupAttachment,
  validateSetupAttachmentIntent,
} from "@ewatrade/assistant/setup/attachments"
import { findSetupConversation } from "@ewatrade/db/assistant"
import {
  AssistantAttachmentError,
  type AssistantAttachmentRecord,
  createAssistantAttachmentIntent,
  listAssistantAttachments,
  removeAssistantAttachment,
} from "@ewatrade/db/assistant-attachments"
import { z } from "zod"
import {
  isSetupAttachmentStorageAvailable,
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../../assistant/attachment-storage"
import { requireSetupAssistantScope } from "../../assistant/setup-context"
import { createTRPCRouter, protectedProcedure } from "../init"

function extractionOf(row: Pick<AssistantAttachmentRecord, "extraction">) {
  const parsed = setupAttachmentExtractionSchema.safeParse(row.extraction)
  return parsed.success ? (parsed.data as SetupAttachmentExtraction) : null
}

/** Owner-facing view: status, summary and (for voice) the transcript to edit. */
export function presentSetupAttachment(row: AssistantAttachmentRecord) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    fileName: row.fileName,
    contentType: row.contentType,
    sent: Boolean(row.messageId),
    summary: summarizeSetupAttachment({
      kind: row.kind,
      durationMs: row.durationMs,
      extraction: extractionOf(row),
    }),
    transcript: row.kind === "AUDIO" ? row.transcript : null,
    error:
      row.status === "FAILED"
        ? describeSetupAttachmentError(row.errorCode)
        : null,
  }
}

export const setupAssistantAttachmentsRouter = createTRPCRouter({
  /** Saves an upload intent; the bytes follow with PUT to `uploadPath`. */
  createIntent: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).max(64),
        fileName: z.string().min(1).max(260),
        contentType: z.string().min(3).max(120),
        sizeBytes: z.number().int().positive(),
        contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        durationMs: z.number().int().positive().max(600_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const conversation = await findSetupConversation(ctx.db, scope)
      if (
        !conversation ||
        conversation.id !== input.conversationId ||
        conversation.status !== "ACTIVE"
      )
        return { ok: false as const, reason: "CONVERSATION_CLOSED" as const }
      const checked = validateSetupAttachmentIntent(input)
      if (!checked.ok) return { ok: false as const, reason: checked.reason }
      if (!isSetupAttachmentStorageAvailable(scope.dataClassification))
        return { ok: false as const, reason: "UPLOADS_UNAVAILABLE" as const }
      try {
        const attachment = await createAssistantAttachmentIntent(
          ctx.db,
          scope,
          {
            conversationId: conversation.id,
            kind: checked.kind,
            fileName: sanitizeSetupAttachmentName(input.fileName),
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
            contentDigest: input.contentDigest,
            durationMs: input.durationMs,
            maxPerConversation: SETUP_ATTACHMENTS_PER_CONVERSATION,
            uploadWindowMs: SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
            retentionMs: SETUP_ATTACHMENT_RETENTION_MS,
          },
        )
        return {
          ok: true as const,
          attachment: presentSetupAttachment(attachment),
          uploadPath: `/api/assistant/attachments/${attachment.id}/upload`,
        }
      } catch (error) {
        if (
          error instanceof AssistantAttachmentError &&
          error.code === "ATTACHMENT_LIMIT"
        )
          return { ok: false as const, reason: "ATTACHMENT_LIMIT" as const }
        throw error
      }
    }),

  /** Polled while files upload and are read. */
  list: protectedProcedure
    .input(
      z.object({ attachmentIds: z.array(z.string().min(1).max(64)).max(8) }),
    )
    .query(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const rows = await listAssistantAttachments(
        ctx.db,
        scope,
        input.attachmentIds,
      )
      return rows.map(presentSetupAttachment)
    }),

  /** Drops a file the owner has not sent yet, including its stored bytes. */
  remove: protectedProcedure
    .input(z.object({ attachmentId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const removed = await removeAssistantAttachment(
        ctx.db,
        scope,
        input.attachmentId,
      )
      if (removed?.storagePath)
        await setupAttachmentStorage(scope.dataClassification)
          .remove({ target: setupAttachmentTarget(removed) })
          .catch(() => {
            // Best effort: orphaned bytes wait for storage cleanup (Phase 6).
          })
      return { removed: Boolean(removed) }
    }),
})
