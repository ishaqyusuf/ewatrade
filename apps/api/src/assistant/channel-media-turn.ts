import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { parseWhatsAppTypedAction } from "@ewatrade/assistant/channels/action-review"
import {
  whatsAppCaptionOrderNumbers,
  whatsAppMediaContentSchema,
  whatsAppPhotoChoiceContentSchema,
  whatsAppPhotoChoiceText,
  whatsAppVoiceChoiceContentSchema,
} from "@ewatrade/assistant/channels/media"
import { whatsAppMediaRefusalNotice } from "@ewatrade/assistant/channels/notice"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import {
  type WhatsAppInboxLease,
  consumeAssistantWhatsAppPhotoReviewInTransaction,
  consumeAssistantWhatsAppVoiceReviewInTransaction,
  deferAssistantWhatsAppMediaInbox,
  settleAssistantWhatsAppNotice,
  stageAssistantWhatsAppImportHandoffInTransaction,
  stageAssistantWhatsAppPhotoReviewInTransaction,
  stageAssistantWhatsAppVoiceReviewInTransaction,
} from "@ewatrade/db/assistant-whatsapp"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"
import { resolveOrderScope } from "@ewatrade/db/queries"
import { isLinkedAssistantIdentity } from "./channel-principal"
import {
  type GeneralContext,
  canDraftGeneralCapability,
  requireGeneralScope,
} from "./general-context"
import type { GeneralTurnInput } from "./general-turn-contract"
import { ingestAssistantWhatsAppMedia } from "./whatsapp-media/ingest"

export type WhatsAppPreparedMediaTurn =
  | { kind: "not_media" }
  | { kind: "input"; parts: GeneralTurnInput["message"]["parts"] }
  | { kind: "completed" }
  | { kind: "retry" }

/**
 * The one order a photo caption names, when the sender may file photos on
 * orders and exactly one visible order matches. Anything else keeps the
 * ordinary photo turn.
 */
export async function resolveAssistantWhatsAppCaptionOrder(
  ctx: GeneralContext,
  caption: string | undefined,
) {
  const numbers = whatsAppCaptionOrderNumbers(caption)
  if (
    !numbers.length ||
    !canDraftGeneralCapability(ctx, capabilityForAction("order_attachment_add"))
  )
    return null
  const scope = requireGeneralScope(ctx)
  const visibility = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    activeStoreId: scope.storeId,
    userId: scope.userId,
    role: ctx.tenantContext.membership.role,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  const orders = await ctx.db.commercialOrder.findMany({
    where: { ...visibility, orderNumber: { in: numbers } },
    select: { id: true },
    take: 2,
  })
  return orders.length === 1 ? (orders[0] ?? null) : null
}

export async function prepareAssistantWhatsAppMediaTurn(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  inbox: {
    providerMessageId: string
    content: unknown
    receivedAt: Date
  },
): Promise<WhatsAppPreparedMediaTurn> {
  if (
    !isLinkedAssistantIdentity(ctx.session) ||
    ctx.session.principal.bindingId !== lease.bindingId
  )
    throw Error("WhatsApp media authority changed.")
  const principal = ctx.session.principal
  const notice = async (
    code: Parameters<typeof settleAssistantWhatsAppNotice>[1]["code"],
  ): Promise<WhatsAppPreparedMediaTurn> => {
    await settleAssistantWhatsAppNotice(ctx.db, { principal, lease, code })
    return { kind: "completed" }
  }
  const photoChoice = whatsAppPhotoChoiceContentSchema.safeParse(inbox.content)
  if (photoChoice.success) {
    let picked: Awaited<
      ReturnType<typeof consumeAssistantWhatsAppPhotoReviewInTransaction>
    >
    try {
      picked = await runInOwnSerializableTransaction(ctx.db, (tx) =>
        consumeAssistantWhatsAppPhotoReviewInTransaction(tx, {
          principal,
          lease,
          choice: photoChoice.data.choice,
        }),
      )
    } catch {
      return notice("PHOTO_CHOICE_EXPIRED")
    }
    if (picked.state === "discarded") return notice("PHOTO_DISCARDED")
    // The canonical turn drafts order_attachment_add for review; nothing is attached here.
    return {
      kind: "input",
      parts: [
        {
          type: "text",
          text: whatsAppPhotoChoiceText(picked.state, picked.order),
        },
        {
          type: SETUP_ATTACHMENT_PART,
          data: { attachmentId: picked.attachmentId },
        },
      ],
    }
  }
  if (
    inbox.content &&
    typeof inbox.content === "object" &&
    "type" in inbox.content &&
    inbox.content.type === "invalid_photo_choice"
  )
    return notice("PHOTO_CHOICE_EXPIRED")
  const choice = whatsAppVoiceChoiceContentSchema.safeParse(inbox.content)
  if (choice.success) {
    let selected: Awaited<
      ReturnType<typeof consumeAssistantWhatsAppVoiceReviewInTransaction>
    >
    try {
      selected = await runInOwnSerializableTransaction(ctx.db, async (tx) => {
        const selection =
          await consumeAssistantWhatsAppVoiceReviewInTransaction(tx, {
            principal,
            lease,
            choice: choice.data.choice,
          })
        if (
          selection.state === "ready" &&
          parseWhatsAppTypedAction(selection.text)
        )
          throw Error("Use an exact WhatsApp action reply for confirmation.")
        return selection
      })
    } catch {
      return notice("VOICE_INVALID")
    }
    if (selected.state === "cancelled") return notice("VOICE_CANCELLED")
    if (selected.state !== "ready") return notice("VOICE_INVALID")
    return {
      kind: "input",
      parts: [
        { type: "text", text: selected.text },
        {
          type: SETUP_ATTACHMENT_PART,
          data: { attachmentId: selected.attachmentId },
        },
      ],
    }
  }
  if (
    inbox.content &&
    typeof inbox.content === "object" &&
    "type" in inbox.content &&
    inbox.content.type === "invalid_voice_choice"
  )
    return notice("VOICE_INVALID")
  const source = whatsAppMediaContentSchema.safeParse(inbox.content)
  if (!source.success) return { kind: "not_media" }
  if (Date.now() - inbox.receivedAt.getTime() > 15 * 60_000)
    return notice("MEDIA_FAILED")
  let media: Awaited<ReturnType<typeof ingestAssistantWhatsAppMedia>>
  try {
    media = await ingestAssistantWhatsAppMedia({
      ctx,
      providerMessageId: inbox.providerMessageId,
      content: inbox.content,
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return notice("MEDIA_FAILED")
  }
  if (media.state === "refused")
    return notice(whatsAppMediaRefusalNotice(media.code))
  if (media.state === "processing") {
    await deferAssistantWhatsAppMediaInbox(ctx.db, lease)
    return { kind: "retry" }
  }
  if (media.state === "voice_review") {
    await runInOwnSerializableTransaction(ctx.db, (tx) =>
      stageAssistantWhatsAppVoiceReviewInTransaction(tx, {
        principal,
        lease,
        attachmentId: media.attachmentId,
        transcriptDigest: media.transcriptDigest,
        processingGeneration: media.processingGeneration,
      }),
    )
    return { kind: "completed" }
  }
  if (media.state === "import_handoff") {
    try {
      await runInOwnSerializableTransaction(ctx.db, (tx) =>
        stageAssistantWhatsAppImportHandoffInTransaction(tx, {
          principal,
          lease,
          fileName: media.fileName,
          rows: media.rows,
        }),
      )
    } catch {
      return notice("MEDIA_FAILED")
    }
    return { kind: "completed" }
  }
  if (media.kind === "IMAGE" && ctx.session.purpose === "GENERAL") {
    // A caption naming one visible order gets Attach / Other order / Discard.
    // Unresolved or failed lookups keep the ordinary photo turn.
    const staged = await resolveAssistantWhatsAppCaptionOrder(
      ctx,
      source.data.text,
    )
      .then(async (order) => {
        if (!order) return false
        await runInOwnSerializableTransaction(ctx.db, (tx) =>
          stageAssistantWhatsAppPhotoReviewInTransaction(tx, {
            principal,
            lease,
            attachmentId: media.attachmentId,
            orderId: order.id,
          }),
        )
        return true
      })
      .catch(() => false)
    if (staged) return { kind: "completed" }
  }
  return { kind: "input", parts: media.parts }
}
