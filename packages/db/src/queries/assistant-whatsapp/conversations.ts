import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import { AssistantWhatsAppError, requireWhatsAppActorScope } from "./authority"
import {
  type WhatsAppGrantPrincipal,
  resolveAssistantWhatsAppGrant,
} from "./grants"
import { cancelAssistantWhatsAppQueuedWorkInTransaction } from "./queued-work"

export type WhatsAppConversationPrincipal = WhatsAppGrantPrincipal & {
  bindingId: string
  selectionGeneration: number
}

/** Every queued turn captures this proof; later scope changes cannot retarget it. */
export async function resolveAssistantWhatsAppConversation(
  db: DbClient,
  principal: WhatsAppConversationPrincipal,
  now = new Date(),
) {
  const resolved = await resolveAssistantWhatsAppGrant(db, principal, now)
  const binding = await db.assistantWhatsAppBinding.findFirst({
    where: {
      id: principal.bindingId,
      grantId: principal.grantId,
      identityGeneration: principal.identityGeneration,
      grantGeneration: principal.grantGeneration,
      selectionGeneration: principal.selectionGeneration,
      identity: {
        id: resolved.grant.identity.id,
        activeBindingId: principal.bindingId,
        selectionGeneration: principal.selectionGeneration,
      },
      conversation: {
        ownerUserId: resolved.scope.userId,
        tenantId: resolved.scope.tenantId,
        storeId: resolved.scope.storeId,
        status: "ACTIVE",
      },
    },
    include: { conversation: { select: { id: true, purpose: true } } },
  })
  if (!binding || binding.purpose !== binding.conversation.purpose)
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (
    binding.purpose !== "GENERAL" &&
    !["OWNER", "ADMIN"].includes(resolved.tenantContext.membership.role)
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  return { ...resolved, binding, conversation: binding.conversation }
}

/** Select an existing canonical chat. Workflow adapters own creating its draft/snapshot. */
export function selectAssistantWhatsAppConversation(
  db: PrismaClient,
  principal: WhatsAppGrantPrincipal,
  conversationId: string,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, (tx) =>
    selectAssistantWhatsAppConversationInTransaction(
      tx,
      principal,
      conversationId,
      now,
    ),
  )
}

export async function selectAssistantWhatsAppConversationInTransaction(
  tx: Prisma.TransactionClient,
  principal: WhatsAppGrantPrincipal,
  conversationId: string,
  now = new Date(),
) {
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${principal.phoneNumberId} AND "senderId"=${principal.senderId} FOR UPDATE`
  const { scope, grant, tenantContext } = await resolveAssistantWhatsAppGrant(
    tx,
    principal,
    now,
  )
  const conversation = await tx.assistantConversation.findFirst({
    where: {
      id: conversationId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      ownerUserId: scope.userId,
      status: "ACTIVE",
    },
    select: { id: true, purpose: true },
  })
  if (
    !conversation ||
    (conversation.purpose !== "GENERAL" &&
      !["OWNER", "ADMIN"].includes(tenantContext.membership.role))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const active = await tx.assistantWhatsAppIdentity.findUniqueOrThrow({
    where: { id: grant.identity.id },
  })
  if (active.activeBindingId) {
    const previous = await tx.assistantWhatsAppBinding.findFirst({
      where: {
        id: active.activeBindingId,
        grantId: grant.id,
        grantGeneration: grant.generation,
        identityGeneration: active.generation,
        selectionGeneration: active.selectionGeneration,
        conversationId,
      },
    })
    if (previous)
      return {
        ...principal,
        bindingId: previous.id,
        selectionGeneration: previous.selectionGeneration,
      }
  }
  const selectionGeneration = active.selectionGeneration + 1
  const binding = await tx.assistantWhatsAppBinding.create({
    data: {
      identityId: active.id,
      grantId: grant.id,
      identityGeneration: active.generation,
      grantGeneration: grant.generation,
      selectionGeneration,
      conversationId,
      purpose: conversation.purpose,
    },
  })
  await tx.assistantWhatsAppIdentity.update({
    where: { id: active.id },
    data: { selectionGeneration, activeBindingId: binding.id },
  })
  await cancelAssistantWhatsAppQueuedWorkInTransaction(
    tx,
    active.id,
    binding.id,
    now,
  )
  return { ...principal, bindingId: binding.id, selectionGeneration }
}

export function changeAssistantWhatsAppStore(
  db: PrismaClient,
  principal: WhatsAppGrantPrincipal,
  storeId: string,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${principal.phoneNumberId} AND "senderId"=${principal.senderId} FOR UPDATE`
    const resolved = await resolveAssistantWhatsAppGrant(tx, principal, now)
    const tenantContext = await requireWhatsAppActorScope(tx, {
      ...resolved.scope,
      storeId,
    })
    if (storeId === resolved.scope.storeId) return { principal, tenantContext }
    const grant = await tx.assistantWhatsAppGrant.update({
      where: { id: resolved.grant.id },
      data: { storeId, generation: { increment: 1 } },
    })
    await tx.assistantWhatsAppIdentity.update({
      where: { id: grant.identityId },
      data: { activeBindingId: null, selectionGeneration: { increment: 1 } },
    })
    await cancelAssistantWhatsAppQueuedWorkInTransaction(
      tx,
      grant.identityId,
      null,
      now,
    )
    return {
      principal: { ...principal, grantGeneration: grant.generation },
      tenantContext,
    }
  })
}

/** A signed sender may always revoke its own channel, including after losing Store access. */
export function disconnectAssistantWhatsApp(
  db: PrismaClient,
  input: { phoneNumberId: string; senderId: string },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, (tx) =>
    disconnectAssistantWhatsAppInTransaction(tx, input, now),
  )
}

/** Internal canonical revocation for callers already holding the sender identity lock. */
export async function disconnectAssistantWhatsAppInTransaction(
  tx: Prisma.TransactionClient,
  input: { phoneNumberId: string; senderId: string },
  now: Date,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-sender:${input.phoneNumberId}:${input.senderId}`}))`
  // A late delivery of a pre-STOP app link must not auto-connect a verified
  // account phone, even when this sender has never had an identity yet.
  const verifiedOwners = await tx.user.findMany({
    where: {
      phone: { in: [input.senderId, `+${input.senderId}`] },
      phoneVerifiedAt: { not: null, lte: now },
    },
    select: { id: true },
  })
  if (verifiedOwners.length)
    await tx.assistantWhatsAppLink.updateMany({
      where: {
        phoneNumberId: input.phoneNumberId,
        userId: { in: verifiedOwners.map((owner) => owner.id) },
        createdAt: { lte: now },
        confirmedAt: null,
        cancelledAt: null,
      },
      data: { cancelledAt: now, revision: { increment: 1 } },
    })
  await tx.assistantWhatsAppLink.updateMany({
    where: {
      phoneNumberId: input.phoneNumberId,
      claimedSenderId: input.senderId,
      confirmedAt: null,
      cancelledAt: null,
    },
    data: { cancelledAt: now, revision: { increment: 1 } },
  })
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${input.phoneNumberId} AND "senderId"=${input.senderId} FOR UPDATE`
  const identity = await tx.assistantWhatsAppIdentity.findUnique({
    where: { phoneNumberId_senderId: input },
  })
  if (!identity) return { disconnected: true as const }
  if (!identity.revokedAt) {
    await tx.assistantWhatsAppIdentity.update({
      where: { id: identity.id },
      data: {
        revokedAt: now,
        generation: { increment: 1 },
        selectionGeneration: { increment: 1 },
        controlSequence: { increment: 1 },
        activeBindingId: null,
      },
    })
    await tx.assistantWhatsAppGrant.updateMany({
      where: { identityId: identity.id, revokedAt: null },
      data: { revokedAt: now, generation: { increment: 1 } },
    })
  }
  await cancelAssistantWhatsAppQueuedWorkInTransaction(
    tx,
    identity.id,
    null,
    now,
    {
      includeControls: true,
      reason: "CHANNEL_DISCONNECTED",
    },
  )
  await tx.assistantWhatsAppLink.updateMany({
    where: {
      phoneNumberId: input.phoneNumberId,
      userId: identity.userId,
      confirmedAt: null,
      cancelledAt: null,
    },
    data: { cancelledAt: now, revision: { increment: 1 } },
  })
  return { disconnected: true as const }
}
