import { parseWhatsAppTypedAction } from "@ewatrade/assistant/channels/action-review"
import {
  whatsAppMediaContentSchema,
  whatsAppVoiceChoiceContentSchema,
} from "@ewatrade/assistant/channels/media"
import { whatsAppMediaRefusalNotice } from "@ewatrade/assistant/channels/notice"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import {
  type WhatsAppInboxLease,
  consumeAssistantWhatsAppVoiceReviewInTransaction,
  deferAssistantWhatsAppMediaInbox,
  settleAssistantWhatsAppNotice,
  stageAssistantWhatsAppVoiceReviewInTransaction,
} from "@ewatrade/db/assistant-whatsapp"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralContext } from "./general-context"
import type { GeneralTurnInput } from "./general-turn-contract"
import { ingestAssistantWhatsAppMedia } from "./whatsapp-media/ingest"

export type WhatsAppPreparedMediaTurn =
  | { kind: "not_media" }
  | { kind: "input"; parts: GeneralTurnInput["message"]["parts"] }
  | { kind: "completed" }
  | { kind: "retry" }

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
  if (!whatsAppMediaContentSchema.safeParse(inbox.content).success)
    return { kind: "not_media" }
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
  return { kind: "input", parts: media.parts }
}
