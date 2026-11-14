import { createHash } from "node:crypto"
import {
  SETUP_ATTACHMENTS_PER_CONVERSATION,
  SETUP_ATTACHMENT_PART,
  SETUP_ATTACHMENT_RETENTION_MS,
  SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
  validateSetupAttachmentIntent,
} from "@ewatrade/assistant/setup/attachments"
import {
  type AssistantTelegramConfig,
  DirectTelegramBotProvider,
} from "@ewatrade/communications"
import {
  claimAssistantAttachmentProcessing,
  completeAssistantAttachmentProcessing,
  createAssistantAttachmentIntentInTransaction,
  markAssistantAttachmentUploaded,
  pinAssistantAttachmentStorage,
} from "@ewatrade/db/assistant-attachments"
import type { TelegramInboundContent } from "@ewatrade/db/assistant-telegram"
import {
  acceptsAssistantAttachmentBytes,
  assistantAttachmentStoragePath,
} from "@ewatrade/private-media/assistant-attachments"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"
import type { GeneralTurnInput } from "./general-turn-contract"

type MediaContent = Extract<TelegramInboundContent, { kind: "media" }>
const MAX_BYTES = 5 * 1024 * 1024

export type TelegramFileIngest =
  | { kind: "ready"; parts: GeneralTurnInput["message"]["parts"] }
  | { kind: "refused"; text: string }

/**
 * A photo or PDF sent to the bot (Telegram receipts): download it once, store it
 * as this chat's attachment and mark it ready, so the turn can read it like an
 * upload from the app. Replays reuse the same attachment by its Telegram file.
 */
export async function ingestTelegramFile(
  ctx: GeneralContext,
  config: Pick<AssistantTelegramConfig, "token">,
  content: MediaContent,
  download: (input: {
    fileId: string
    maxBytes: number
  }) => Promise<Uint8Array> = (input) =>
    new DirectTelegramBotProvider(config).downloadFile(input),
): Promise<TelegramFileIngest> {
  const conversationId = ctx.assistantConversationId
  if (!conversationId) return { kind: "refused", text: unavailable }
  const scope = requireGeneralScope(ctx)
  const kind = content.contentType === "application/pdf" ? "PDF" : "IMAGE"
  const clientRequestId = `telegram-media:${content.fileUniqueId}`.slice(0, 128)
  const existing = await ctx.db.assistantAttachment.findFirst({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.userId,
      conversationId,
      clientRequestId,
      status: "READY",
      retentionUntil: { gt: new Date() },
    },
    select: { id: true, messageId: true },
  })
  if (existing && !existing.messageId) return ready(existing.id)
  const storage = setupAttachmentStorage(scope.dataClassification)
  try {
    storage.assertAvailable()
  } catch {
    return { kind: "refused", text: unavailable }
  }
  let bytes: Uint8Array
  try {
    bytes = await download({ fileId: content.fileId, maxBytes: MAX_BYTES })
  } catch (error) {
    return {
      kind: "refused",
      text:
        (error as { code?: unknown })?.code === "MEDIA_TOO_LARGE"
          ? "That file is too large. Send a photo or PDF under 5 MB."
          : unavailable,
    }
  }
  const intent = validateSetupAttachmentIntent({
    contentType: content.contentType,
    sizeBytes: bytes.byteLength,
  })
  if (
    !intent.ok ||
    !acceptsAssistantAttachmentBytes(bytes, content.contentType)
  )
    return {
      kind: "refused",
      text: "I couldn't open that file. Send a clear photo or PDF.",
    }
  const contentDigest = createHash("sha256").update(bytes).digest("hex")
  const row = await inFreshGeneralTransaction(ctx, (fresh) =>
    createAssistantAttachmentIntentInTransaction(
      fresh.db,
      requireGeneralScope(fresh),
      {
        conversationId,
        kind,
        fileName: content.fileName,
        contentType: content.contentType,
        sizeBytes: bytes.byteLength,
        contentDigest,
        clientRequestId,
        maxPerConversation: SETUP_ATTACHMENTS_PER_CONVERSATION,
        uploadWindowMs: SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
        retentionMs: SETUP_ATTACHMENT_RETENTION_MS,
      },
    ),
  )
  if (row.status === "READY" && !row.messageId) return ready(row.id)
  if (row.status !== "PENDING_UPLOAD" || row.contentDigest !== contentDigest)
    return { kind: "refused", text: unavailable }
  const target = setupAttachmentTarget(row)
  const storagePath = assistantAttachmentStoragePath(target)
  if (
    !storage.storeId ||
    !(await pinAssistantAttachmentStorage(ctx.db, scope, {
      attachmentId: row.id,
      storageProvider: storage.provider,
      storageStoreId: storage.storeId,
      storagePath,
    }))
  )
    return { kind: "refused", text: unavailable }
  await storage.stage({ target, bytes })
  const uploaded = await markAssistantAttachmentUploaded(ctx.db, {
    attachmentId: row.id,
    storageProvider: storage.provider,
    storageStoreId: storage.storeId,
    storagePath,
    // Chat photos need no processing: they are kept as sent.
    ...(kind === "IMAGE" ? { readyGeneralImage: true as const } : {}),
  })
  if (!uploaded) {
    await storage.remove({ target }).catch(() => undefined)
    return { kind: "refused", text: unavailable }
  }
  if (kind === "PDF") {
    // Finished here rather than by a background run: the turn reads receipts itself.
    const claimed = await claimAssistantAttachmentProcessing(ctx.db, {
      attachmentId: row.id,
      leaseMs: 60_000,
      maxAttempts: 3,
    })
    if (!claimed) return { kind: "refused", text: unavailable }
    await completeAssistantAttachmentProcessing(ctx.db, {
      attachmentId: row.id,
      generation: claimed.processingAttempts,
      transcript: null,
      extraction: {
        type: "text",
        text: "PDF attached; not read.",
        truncated: false,
      },
      durationMs: null,
    })
  }
  return ready(row.id)

  function ready(attachmentId: string): TelegramFileIngest {
    return {
      kind: "ready",
      parts: [
        ...(content.caption?.trim()
          ? [{ type: "text" as const, text: content.caption.trim() }]
          : []),
        { type: SETUP_ATTACHMENT_PART, data: { attachmentId } },
      ],
    }
  }
}

const unavailable =
  "I couldn't get that file. Send it again, or attach it in the EwaTrade chat."
