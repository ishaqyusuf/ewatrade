import { WHATSAPP_DELIVERY_REQUEST_MS } from "@ewatrade/assistant/channels/delivery"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
import {
  DirectMetaWhatsAppProvider,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"

const attempted = "CHANNEL_DISCONNECTED_NOTICE_INTENT"
const sent = "CHANNEL_DISCONNECTED_NOTICE_SENT"

/** Personal control receipt only. Intent is committed before HTTP; an ambiguous send is never repeated. */
export async function sendAssistantWhatsAppDisconnectNotice(controlId: string) {
  const config = readAssistantWhatsAppConfig()
  if (!config) return { status: "disabled" as const }
  const now = new Date()
  const address = await prisma.$transaction(
    async (tx) => {
      const row = await tx.assistantWhatsAppInbox.findUnique({
        where: { id: controlId },
      })
      if (
        !row ||
        row.kind !== "CONTROL" ||
        row.state !== "COMPLETED" ||
        row.errorCode !== "CHANNEL_DISCONNECTED" ||
        !row.identityId ||
        row.identityGeneration === null ||
        row.selectionGeneration === null ||
        row.bindingId ||
        row.phoneNumberId !== config.phoneNumberId ||
        row.expiresAt <= now ||
        row.providerOccurredAt.getTime() + 24 * 60 * 60_000 <= now.getTime()
      )
        return null
      await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE id=${row.identityId} FOR SHARE`
      const identity = await tx.assistantWhatsAppIdentity.findUnique({
        where: { id: row.identityId },
      })
      if (
        !identity?.revokedAt ||
        identity.activeBindingId ||
        identity.phoneNumberId !== row.phoneNumberId ||
        identity.generation !== row.identityGeneration + 1 ||
        identity.selectionGeneration !== row.selectionGeneration + 1
      )
        return null
      // Revocation must not turn a synthetic business identity into a live provider effect.
      if (
        await tx.assistantWhatsAppGrant.findFirst({
          where: {
            identityId: identity.id,
            tenant: { dataClassification: "QA" },
          },
          select: { id: true },
        })
      )
        return null
      const reserved = await tx.assistantWhatsAppInbox.updateMany({
        where: {
          id: row.id,
          kind: "CONTROL",
          state: "COMPLETED",
          errorCode: "CHANNEL_DISCONNECTED",
        },
        data: { errorCode: attempted },
      })
      return reserved.count === 1
        ? { phoneNumberId: row.phoneNumberId, senderId: identity.senderId }
        : null
    },
    { isolationLevel: "Serializable" },
  )
  if (!address) return { status: "idle" as const }
  const current = readAssistantWhatsAppConfig()
  if (!current || current.phoneNumberId !== address.phoneNumberId)
    return { status: "disabled" as const }
  // No current merchant permission or revoked business outbox is used to send this receipt.
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
  try {
    await provider.sendText({
      accessToken: current.accessToken,
      phoneNumberId: address.phoneNumberId,
      to: address.senderId,
      body: presentWhatsAppMessage(
        "Your WhatsApp disconnect request was completed.\n\nSaved chats and records stay in EwaTrade. Phone sign-in codes keep working.\n\nSend CONNECT anytime to connect again.",
        { family: "account" },
      ),
    })
  } catch {
    // Provider acceptance may be ambiguous. Keep the durable intent and do not resend.
    return { status: "unknown" as const }
  }
  await prisma.assistantWhatsAppInbox.updateMany({
    where: { id: controlId, state: "COMPLETED", errorCode: attempted },
    data: { errorCode: sent },
  })
  return { status: "sent" as const }
}
