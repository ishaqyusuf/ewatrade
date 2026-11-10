import {
  WHATSAPP_DELIVERY_REQUEST_MS,
  type WhatsAppDeliveryResult,
} from "@ewatrade/assistant/channels/delivery"
import { assistantWhatsAppUserAllowed } from "@ewatrade/assistant/channels/policy"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
import {
  DirectMetaWhatsAppProvider,
  WhatsAppProviderSendError,
  assistantWhatsAppPilotUserIds,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  beginAssistantWhatsAppDelivery,
  finishAssistantWhatsAppDelivery,
  firstAssistantWhatsAppOutboxForIngress,
  nextAssistantWhatsAppOutbox,
} from "@ewatrade/db/assistant-whatsapp"
import { enqueueAssistantWhatsAppDelivery } from "@ewatrade/jobs/assistant-whatsapp"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"

type DeliveryImage = {
  attachmentId: string
  conversationId: string
  tenantId: string
  dataClassification: "LIVE" | "QA"
}
/** The owner's original photo, read only from this chat's private storage. */
async function readDeliveryImage(
  image: DeliveryImage,
): Promise<{ bytes: Uint8Array; contentType: "image/jpeg" | "image/png" } | null> {
  const row = await prisma.assistantAttachment.findFirst({
    where: {
      id: image.attachmentId,
      conversationId: image.conversationId,
      tenantId: image.tenantId,
      kind: "IMAGE",
      status: "READY",
    },
  })
  const contentType = row?.contentType
  if (
    !row?.storagePath ||
    (contentType !== "image/jpeg" && contentType !== "image/png")
  )
    return null
  const bytes = await setupAttachmentStorage(image.dataClassification)
    .read({ target: setupAttachmentTarget(row) })
    .catch(() => null)
  return bytes ? { bytes: Uint8Array.from(bytes), contentType } : null
}

export function defaultChannelDeliveryDependencies() {
  const provider = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        fetch(url, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(WHATSAPP_DELIVERY_REQUEST_MS),
        }),
      { preconnect: fetch.preconnect },
    ),
  })
  return {
    config: () => {
      const config = readAssistantWhatsAppConfig()
      return config
        ? { ...config, permittedUserIds: assistantWhatsAppPilotUserIds() }
        : null
    },
    begin: (
      id: string,
      options: { phoneNumberId: string; permittedUserIds: readonly string[] },
    ) => beginAssistantWhatsAppDelivery(prisma, id, options),
    finish: (
      proof: Parameters<typeof finishAssistantWhatsAppDelivery>[1],
      outcome: Parameters<typeof finishAssistantWhatsAppDelivery>[2],
    ) => finishAssistantWhatsAppDelivery(prisma, proof, outcome),
    send: (input: Parameters<typeof provider.sendText>[0]) =>
      provider.sendText(input),
    sendButtons: (input: Parameters<typeof provider.sendButtons>[0]) =>
      provider.sendButtons(input),
    sendList: (input: Parameters<typeof provider.sendList>[0]) =>
      provider.sendList(input),
    sendImage: (input: Parameters<typeof provider.sendImage>[0]) =>
      provider.sendImage(input),
    readImage: readDeliveryImage,
    next: (id: string) => nextAssistantWhatsAppOutbox(prisma, id),
  }
}
export type ChannelDeliveryDependencies = Omit<
  ReturnType<typeof defaultChannelDeliveryDependencies>,
  "sendButtons" | "sendList" | "sendImage" | "readImage"
> & {
  sendImage?: ReturnType<typeof defaultChannelDeliveryDependencies>["sendImage"]
  readImage?: ReturnType<typeof defaultChannelDeliveryDependencies>["readImage"]
  sendButtons?: ReturnType<
    typeof defaultChannelDeliveryDependencies
  >["sendButtons"]
  sendList?: ReturnType<typeof defaultChannelDeliveryDependencies>["sendList"]
}
/** ID-only service operation. The repository admits each possible effect once with fresh merchant authority. */
export async function processAssistantChannelDelivery(
  outboxId: string,
  deps: ChannelDeliveryDependencies = defaultChannelDeliveryDependencies(),
): Promise<WhatsAppDeliveryResult> {
  const config = deps.config()
  if (!config) return { status: "disabled" }
  const claim = await deps.begin(outboxId, {
    phoneNumberId: config.phoneNumberId,
    permittedUserIds: config.permittedUserIds,
  })
  const result = async (status: WhatsAppDeliveryResult["status"]) => {
    const next = ["sent", "failed", "cancelled", "expired", "idle"].includes(
      status,
    )
      ? await deps.next(outboxId)
      : null
    return {
      status,
      ...(next && next.id !== outboxId ? { nextOutboxId: next.id } : {}),
    }
  }
  if (claim.kind !== "started") return result(claim.kind)
  const current = deps.config()
  if (
    Date.now() >= claim.dispatchBefore.getTime() ||
    !current ||
    current.phoneNumberId !== claim.phoneNumberId ||
    !assistantWhatsAppUserAllowed(claim.userId, current.permittedUserIds)
  ) {
    await deps.finish(claim.proof, { kind: "cancelled" })
    return result("cancelled")
  }
  let sent: { messageId: string }
  try {
    const input = {
      accessToken: current.accessToken,
      phoneNumberId: claim.phoneNumberId,
      to: claim.senderId,
      // Presentation follows all immutable-body and authority validation. Legacy
      // queued reviews retain their exact canonical content and renderer version.
      body: presentWhatsAppMessage(claim.body, {
        family: claim.presentationFamily,
        maxUnits: claim.buttons?.length ? 1024 : 4096,
      }),
      callbackData: claim.callbackData,
    }
    // A Product photo card: the original image, or nothing at all.
    if (claim.image) {
      const photo =
        deps.readImage && deps.sendImage
          ? await deps.readImage(claim.image)
          : null
      if (!photo || !deps.sendImage)
        throw new WhatsAppProviderSendError(
          "PROVIDER_REJECTED",
          "DEFINITE_FAILURE",
        )
      sent = await deps.sendImage({
        accessToken: input.accessToken,
        phoneNumberId: input.phoneNumberId,
        to: input.to,
        bytes: photo.bytes,
        contentType: photo.contentType,
        // Captions are the exact reviewed product lines; no presentation header.
        caption: claim.image.caption,
        callbackData: input.callbackData,
      })
    } else {
      // A native list only when it is available; otherwise the saved text body.
      const list = claim.list
      const sendList = list ? deps.sendList : undefined
      sent =
        list && sendList
          ? await sendList({
              ...input,
              body: presentWhatsAppMessage(list.body, {
                family: claim.presentationFamily,
                maxUnits: 1024,
              }),
              button: list.button,
              sectionTitle: list.sectionTitle,
              rows: list.rows,
            })
          : claim.buttons?.length && deps.sendButtons
            ? await deps.sendButtons({ ...input, buttons: claim.buttons })
            : await deps.send(input)
    }
  } catch (error) {
    const outcome =
      error instanceof WhatsAppProviderSendError &&
      error.outcome === "DEFINITE_FAILURE"
        ? "rejected"
        : "unknown"
    const saved = await deps.finish(claim.proof, { kind: outcome })
    return result(
      saved?.state === "SENT" ||
        saved?.state === "DELIVERED" ||
        saved?.state === "READ"
        ? "sent"
        : outcome === "unknown"
          ? "unknown"
          : "failed",
    )
  }
  // Persistence failure after acceptance must never be reclassified as a definite provider rejection.
  const saved = await deps.finish(claim.proof, {
    kind: "accepted",
    providerMessageId: sent.messageId,
  })
  return result(
    !saved ? "unknown" : saved.state === "FAILED" ? "failed" : "sent",
  )
}
export async function dispatchAssistantWhatsAppReply(ingressId: string) {
  const row = await firstAssistantWhatsAppOutboxForIngress(prisma, ingressId)
  if (row) await enqueueAssistantWhatsAppDelivery(row.id)
}
