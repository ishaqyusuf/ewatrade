import { createHash } from "node:crypto"
import { whatsAppControlTaskStarterSchema } from "@ewatrade/assistant/channels/controls"
import type { Prisma } from "../../../generated/prisma/client"
import { AssistantWhatsAppError } from "./authority"
import type { resolveAssistantWhatsAppConversation } from "./conversations"
import { reserveAssistantWhatsAppTransportInTransaction } from "./usage"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
/** Explicit accepted menu selection launches only an empty task; no proposed values or approval. */
export async function enqueueAssistantWhatsAppControlTaskInTransaction(
  tx: Prisma.TransactionClient,
  selected: Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>,
  parent: {
    id: string
    phoneNumberId: string
    providerMessageId: string
    contentDigest: string
    providerOccurredAt: Date
    receivedAt: Date
    expiresAt: Date
  },
  input: string,
  now: Date,
) {
  const starter = whatsAppControlTaskStarterSchema.parse(input)
  if (
    selected.conversation.purpose !== "GENERAL" ||
    parent.phoneNumberId !== selected.principal.phoneNumberId ||
    parent.expiresAt <= now
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const providerMessageId = `control-task:${parent.id}`
  const content = { type: "text", text: starter }
  const contentDigest = hash(
    JSON.stringify({
      senderId: selected.principal.senderId,
      parentMessageId: parent.providerMessageId,
      parentDigest: parent.contentDigest,
      content,
    }),
  )
  const prior = await tx.assistantWhatsAppInbox.findUnique({
    where: {
      phoneNumberId_providerMessageId: {
        phoneNumberId: parent.phoneNumberId,
        providerMessageId,
      },
    },
  })
  if (prior) {
    if (
      prior.kind !== "TURN" ||
      prior.bindingId !== selected.binding.id ||
      prior.contentDigest !== contentDigest
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { kind: "queued" as const, id: prior.id }
  }
  const usage = await reserveAssistantWhatsAppTransportInTransaction(
    tx,
    selected.scope,
    "ingress",
    now,
  )
  if (!usage.allowed) return { kind: "rate_limited" as const }
  const sequence = await tx.assistantWhatsAppBinding.update({
    where: { id: selected.binding.id },
    data: { inboundSequence: { increment: 1 } },
    select: { inboundSequence: true },
  })
  const id = `wa-task_${hash(parent.id).slice(0, 40)}`
  const row = await tx.assistantWhatsAppInbox.create({
    data: {
      id,
      kind: "TURN",
      bindingId: selected.binding.id,
      phoneNumberId: parent.phoneNumberId,
      providerMessageId,
      contentDigest,
      sequence: sequence.inboundSequence,
      requestId: `${id}-turn`,
      userMessageId: `${id}-message`,
      providerOccurredAt: parent.providerOccurredAt,
      receivedAt: parent.receivedAt,
      expiresAt: parent.expiresAt,
      content,
    },
    select: { id: true },
  })
  return { kind: "queued" as const, id: row.id }
}
