import { createHash, randomUUID } from "node:crypto"
import {
  WHATSAPP_CONTROL_LIFETIME_MS,
  WHATSAPP_CONTROL_RENDER_VERSION,
  type WhatsAppControlMenu,
  renderWhatsAppControl,
  whatsAppControlLabel,
} from "@ewatrade/assistant/channels/controls"
import type { Prisma } from "../../../generated/prisma/client"
import { AssistantWhatsAppError } from "./authority"
import {
  assistantWhatsAppControlAuthorityDigest,
  readControlScope,
} from "./control-authority"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const claimId = (linkId: string) => `wa-link-claim_${linkId}`
const welcomeId = (linkId: string, generation: number) =>
  `wa-link-welcome_${linkId}_${generation}`

/** A signed sender claim is transport evidence only, with no identity or access. */
export async function stageAssistantWhatsAppLinkClaimInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    linkId: string
    phoneNumberId: string
    messageId: string
    providerOccurredAt: Date
    expiresAt: Date
  },
  now: Date,
) {
  const content = { type: "link_claim", linkId: input.linkId }
  const prior = await tx.assistantWhatsAppInbox.findUnique({
    where: {
      phoneNumberId_providerMessageId: {
        phoneNumberId: input.phoneNumberId,
        providerMessageId: input.messageId,
      },
    },
    select: { id: true },
  })
  if (prior) throw new AssistantWhatsAppError("CONFLICT")
  await tx.assistantWhatsAppInbox.create({
    data: {
      id: claimId(input.linkId),
      phoneNumberId: input.phoneNumberId,
      providerMessageId: input.messageId,
      kind: "CONTROL",
      sequence: 0,
      requestId: randomUUID(),
      userMessageId: randomUUID(),
      providerOccurredAt: input.providerOccurredAt,
      receivedAt: now,
      expiresAt: input.expiresAt,
      state: "COMPLETED",
      completedAt: now,
      content,
      contentDigest: hash(JSON.stringify(content)),
    },
  })
}

/** Stage once inside real consent; dispatch rechecks the existing control authority/window. */
export async function stageAssistantWhatsAppLinkWelcomeInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    linkId: string
    identityId: string
    grantId: string
    grantGeneration: number
    storeId: string
    phoneNumberId: string
    messageId: string | null
  },
  now: Date,
) {
  const proof = await tx.assistantWhatsAppInbox.findUnique({
    where: { id: claimId(input.linkId) },
  })
  // Older links without a signed timestamp still connect, but never fabricate a send window.
  if (!proof) return null
  if (
    proof.kind !== "CONTROL" ||
    proof.identityId ||
    proof.bindingId ||
    proof.state !== "COMPLETED" ||
    proof.phoneNumberId !== input.phoneNumberId ||
    proof.providerMessageId !== input.messageId ||
    proof.contentDigest !==
      hash(JSON.stringify({ type: "link_claim", linkId: input.linkId }))
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const expiresAt = new Date(
    Math.min(
      proof.expiresAt.getTime(),
      proof.providerOccurredAt.getTime() + WHATSAPP_CONTROL_LIFETIME_MS,
    ),
  )
  if (expiresAt <= now) return null
  const identity = await tx.assistantWhatsAppIdentity.update({
    where: { id: input.identityId },
    data: { controlSequence: { increment: 1 } },
  })
  const scope = await readControlScope(
    tx,
    identity,
    input.grantId,
    input.storeId,
    now,
    input.grantGeneration,
  )
  const menu: WhatsAppControlMenu = {
    version: WHATSAPP_CONTROL_RENDER_VERSION,
    identityGeneration: identity.generation,
    selectionGeneration: identity.selectionGeneration,
    quotaScope: scope.proof,
    scopes: [scope.proof],
    title: `Connected to ${whatsAppControlLabel(scope.context.tenant.name, 160)}`,
    detail: `Store: ${whatsAppControlLabel(scope.context.activeStore?.name ?? "Store", 160)}. Try “Show today's sales” or “Check stock”. Send Help for guidance, Business or Store to choose your working scope, and Disconnect to revoke WhatsApp access. Your existing permissions apply.`,
    choices: [],
  }
  const content = {
    type: "control" as const,
    command: { kind: "help" as const },
    menu,
  }
  const authorityDigest = await assistantWhatsAppControlAuthorityDigest(
    tx,
    identity,
    menu,
    now,
  )
  const body = renderWhatsAppControl(menu)
  await tx.assistantWhatsAppInbox.update({
    where: { id: proof.id },
    data: {
      identityId: identity.id,
      identityGeneration: identity.generation,
      selectionGeneration: identity.selectionGeneration,
      sequence: identity.controlSequence,
      content,
      contentDigest: hash(JSON.stringify(content)),
      executionAuthorityDigest: authorityDigest,
      expiresAt,
      completedAt: now,
    },
  })
  const outbox = await tx.assistantWhatsAppOutbox.create({
    data: {
      id: welcomeId(input.linkId, input.grantGeneration),
      inboxId: proof.id,
      phoneNumberId: input.phoneNumberId,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_CONTROL_RENDER_VERSION,
      renderKind: "control",
      authorityDigest,
      content: body,
      contentDigest: hash(body),
      expiresAt,
    },
    select: { id: true },
  })
  return outbox.id
}

export async function readAssistantWhatsAppLinkWelcomeInTransaction(
  tx: Prisma.TransactionClient,
  linkId: string,
  grantGeneration: number,
) {
  const outbox = await tx.assistantWhatsAppOutbox.findUnique({
    where: { id: welcomeId(linkId, grantGeneration) },
    select: { id: true },
  })
  return outbox?.id ?? null
}
