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
import {
  AssistantAttachmentError,
  type AssistantAttachmentRecord,
  createAssistantAttachmentIntent,
  listAssistantAttachments,
  removeAssistantAttachment,
} from "@ewatrade/db/assistant-attachments"
import { readVoiceUsage } from "@ewatrade/db/assistant-voice"
import { enqueueAssistantAttachmentProcessing } from "@ewatrade/jobs/assistant-attachments"
import { z } from "zod"
import {
  isSetupAttachmentStorageAvailable,
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../../assistant/attachment-storage"
import {
  isAssistantVoiceEnabled,
  requireSetupAssistantMedia,
  requireSetupAssistantScope,
} from "../../assistant/setup-context"
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
    retryable:
      row.kind === "AUDIO" &&
      row.processingAttempts < 3 &&
      ["ALL_PROVIDERS_FAILED", "PROCESSING_UNAVAILABLE", "TIMEOUT"].includes(
        row.errorCode ?? "",
      ),
    error:
      row.status === "FAILED"
        ? describeSetupAttachmentError(row.errorCode)
        : null,
  }
}

export const setupAssistantAttachmentsRouter = createTRPCRouter({
  voiceCapabilities: protectedProcedure.query(({ ctx }) => {
    const scope = requireSetupAssistantScope(ctx)
    return {
      enabled:
        isAssistantVoiceEnabled() &&
        isSetupAttachmentStorageAvailable(scope.dataClassification),
      maxDurationMs: 120_000,
    }
  }),
  voiceUsage: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(({ ctx, input }) =>
      readVoiceUsage(ctx.db, requireSetupAssistantScope(ctx), input.days),
    ),
  pending: protectedProcedure
    .input(z.object({ conversationId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const ids = await ctx.db.assistantAttachment.findMany({
        where: {
          conversationId: input.conversationId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          actorUserId: scope.userId,
          messageId: null,
          retentionUntil: { gt: new Date() },
          status: { in: ["UPLOADED", "PROCESSING", "READY", "FAILED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true },
      })
      return (
        await listAssistantAttachments(
          ctx.db,
          scope,
          ids.map((row) => row.id),
        )
      ).map(presentSetupAttachment)
    }),
  retry: protectedProcedure
    .input(z.object({ attachmentId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      requireSetupAssistantMedia("AUDIO")
      const result = await ctx.db.assistantAttachment.updateMany({
        where: {
          id: input.attachmentId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          actorUserId: scope.userId,
          kind: "AUDIO",
          status: "FAILED",
          messageId: null,
          processingAttempts: { lt: 3 },
          retentionUntil: { gt: new Date() },
          conversation: { status: "ACTIVE" },
          errorCode: {
            in: ["ALL_PROVIDERS_FAILED", "PROCESSING_UNAVAILABLE", "TIMEOUT"],
          },
        },
        data: { status: "UPLOADED", errorCode: null },
      })
      if (result.count)
        await enqueueAssistantAttachmentProcessing(input.attachmentId).catch(
          () => undefined,
        )
      return { retried: result.count === 1 }
    }),
  /** Saves an upload intent; the bytes follow with PUT to `uploadPath`. */
  createIntent: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).max(64),
        clientRequestId: z.string().uuid().optional(),
        fileName: z.string().min(1).max(260),
        contentType: z.string().min(3).max(120),
        sizeBytes: z.number().int().positive(),
        contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        durationMs: z.number().int().positive().max(600_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const checked = validateSetupAttachmentIntent(input)
      if (!checked.ok) return { ok: false as const, reason: checked.reason }
      requireSetupAssistantMedia(checked.kind)
      const conversation = await ctx.db.assistantConversation.findFirst({
        where: {
          id: input.conversationId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          purpose: { in: ["SETUP", "PRODUCT_CREATE"] },
          OR: [{ purpose: "SETUP" }, { ownerUserId: scope.userId }],
        },
        select: { id: true, status: true },
      })
      if (
        !conversation ||
        conversation.id !== input.conversationId ||
        conversation.status !== "ACTIVE"
      )
        return { ok: false as const, reason: "CONVERSATION_CLOSED" as const }
      if (!isSetupAttachmentStorageAvailable(scope.dataClassification))
        return { ok: false as const, reason: "UPLOADS_UNAVAILABLE" as const }
      try {
        const attachment = await createAssistantAttachmentIntent(
          ctx.db,
          scope,
          {
            conversationId: conversation.id,
            clientRequestId: input.clientRequestId,
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
