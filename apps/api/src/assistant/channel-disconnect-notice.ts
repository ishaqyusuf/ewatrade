import { whatsAppControlLabel } from "@ewatrade/assistant/channels/controls"
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
      const revoked = await tx.assistantWhatsAppGrant.findMany({
        where: { identityId: identity.id, revokedAt: identity.revokedAt },
        orderBy: { id: "asc" },
        select: { tenant: { select: { name: true } } },
      })
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
        ? {
            phoneNumberId: row.phoneNumberId,
            senderId: identity.senderId,
            businessNames: revoked.map((grant) => grant.tenant.name),
          }
        : null
    },
    { isolationLevel: "Serializable" },
  )
  if (!address) return { status: "idle" as const }
  const from = businessList(address.businessNames)
  const result = await sendControlReceipt(
    address,
    `✅ *Disconnected*\n\n${from ? `This WhatsApp no longer works with ${from}. ` : ""}Your chats and records stay in EwaTrade. Phone sign-in codes keep working.\n\nOlder buttons in this chat no longer work. Send CONNECT to connect again.`,
  )
  if (result.status !== "sent") return result
  await prisma.assistantWhatsAppInbox.updateMany({
    where: { id: controlId, state: "COMPLETED", errorCode: attempted },
    data: { errorCode: sent },
  })
  return result
}

/**
 * STOP receipt. The caller passes it only when its own STOP revoked a live
 * connection, so a redelivered STOP never sends a second one.
 */
export async function sendAssistantWhatsAppStopNotice(input: {
  phoneNumberId: string
  senderId: string
  businessNames: readonly string[]
}) {
  const from = businessList(input.businessNames)
  return sendControlReceipt(
    input,
    `✅ *Stopped*\n\n${from ? `This WhatsApp is disconnected from ${from}. ` : ""}You won't get assistant messages here.\n\nPhone sign-in codes still arrive when you ask for one. Send CONNECT to come back.`,
  )
}

function businessList(names: readonly string[]) {
  const unique = [
    ...new Set(names.map((name) => whatsAppControlLabel(name, 60))),
  ]
  if (unique.length > 3)
    return `${unique.slice(0, 2).join(", ")} and ${unique.length - 2} more`
  if (unique.length > 1)
    return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`
  return unique[0] ?? ""
}

async function sendControlReceipt(
  address: { phoneNumberId: string; senderId: string },
  body: string,
) {
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
      body: presentWhatsAppMessage(body, { family: "account" }),
    })
  } catch {
    // Provider acceptance may be ambiguous. Keep the durable intent and do not resend.
    return { status: "unknown" as const }
  }
  return { status: "sent" as const }
}
