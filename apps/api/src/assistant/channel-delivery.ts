import {
  WHATSAPP_DELIVERY_REQUEST_MS,
  type WhatsAppDeliveryResult,
} from "@ewatrade/assistant/channels/delivery"
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
    next: (id: string) => nextAssistantWhatsAppOutbox(prisma, id),
  }
}
export type ChannelDeliveryDependencies = Omit<
  ReturnType<typeof defaultChannelDeliveryDependencies>,
  "sendButtons"
> & {
  sendButtons?: ReturnType<
    typeof defaultChannelDeliveryDependencies
  >["sendButtons"]
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
    !current.permittedUserIds.includes(claim.userId)
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
      body: claim.body,
      callbackData: claim.callbackData,
    }
    sent =
      claim.buttons?.length && deps.sendButtons
        ? await deps.sendButtons({ ...input, buttons: claim.buttons })
        : await deps.send(input)
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
