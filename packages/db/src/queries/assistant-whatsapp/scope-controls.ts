import { createHash } from "node:crypto"
import {
  type WhatsAppScopeSelection,
  whatsAppScopeSelectionSchema,
} from "@ewatrade/assistant/channels/whatsapp"
import type {
  AssistantWhatsAppIdentity,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { getActiveTenantForUser } from "../tenants"
import type { DbClient } from "../types"
import {
  AssistantWhatsAppError,
  type WhatsAppPersonalActor,
  requireWhatsAppActorScope,
  requireWhatsAppPersonalActor,
} from "./authority"
import {
  resolveAssistantWhatsAppConversation,
  selectAssistantWhatsAppConversationInTransaction,
} from "./conversations"
import type { WhatsAppGrantPrincipal } from "./grants"

export type { WhatsAppPersonalActor } from "./authority"
type ScopePage = { identityId: string; cursor?: string }
type StorePage = ScopePage & { grantId: string }
type ChatPage = StorePage & { storeId: string }
const pageSize = 10

async function requireOwnedIdentity(
  db: DbClient,
  actor: WhatsAppPersonalActor,
  identityId: string,
  phoneNumberId: string,
  now: Date,
) {
  await requireWhatsAppPersonalActor(db, actor, now)
  const identity = await db.assistantWhatsAppIdentity.findFirst({
    where: {
      id: identityId,
      userId: actor.userId,
      phoneNumberId,
      revokedAt: null,
    },
  })
  if (!identity) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return identity
}

function liveGrant(now: Date) {
  return {
    revokedAt: null,
    expiresAt: { gt: now },
    idleExpiresAt: { gt: now },
  }
}

async function requireOwnedGrant(
  db: DbClient,
  identityId: string,
  grantId: string,
  now: Date,
) {
  const grant = await db.assistantWhatsAppGrant.findFirst({
    where: { id: grantId, identityId, ...liveGrant(now) },
  })
  if (!grant) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return grant
}

/** A lost Store assignment must not prevent choosing a remaining accessible Store.
 * This resolves a read context only; it never changes the grant's saved Store. */
export async function choicesContext(
  db: DbClient,
  userId: string,
  grant: { tenantId: string; membershipId: string },
) {
  const tenant = await db.tenant.findUnique({
    where: { id: grant.tenantId },
    select: { slug: true },
  })
  const context = tenant
    ? await getActiveTenantForUser(db, { userId, tenantSlug: tenant.slug })
    : null
  if (!context?.activeStore) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return requireWhatsAppActorScope(db, {
    userId,
    tenantId: grant.tenantId,
    membershipId: grant.membershipId,
    storeId: context.activeStore.id,
  })
}

function selectionState(identity: {
  id: string
  generation: number
  selectionGeneration: number
}) {
  return {
    identityId: identity.id,
    identityGeneration: identity.generation,
    selectionGeneration: identity.selectionGeneration,
  }
}

/** Only explicitly consented grants are discoverable. Customer/OTP phone matches confer none. */
export async function listAssistantWhatsAppBusinesses(
  db: DbClient,
  actor: WhatsAppPersonalActor,
  phoneNumberId: string,
  input: ScopePage,
  now = new Date(),
) {
  const identity = await requireOwnedIdentity(
    db,
    actor,
    input.identityId,
    phoneNumberId,
    now,
  )
  const grants = await db.assistantWhatsAppGrant.findMany({
    where: {
      identityId: identity.id,
      ...liveGrant(now),
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: pageSize + 1,
  })
  const choices: Array<{
    grantId: string
    grantGeneration: number
    tenantId: string
    name: string
    selectedStoreId: string
  }> = []
  for (const grant of grants.slice(0, pageSize)) {
    try {
      const context = await choicesContext(db, actor.userId, grant)
      choices.push({
        grantId: grant.id,
        grantGeneration: grant.generation,
        tenantId: grant.tenantId,
        name: context.tenant.name,
        selectedStoreId: grant.storeId,
      })
    } catch (error) {
      if (
        !(error instanceof AssistantWhatsAppError) ||
        error.code !== "UNAUTHORIZED"
      )
        throw error
    }
  }
  return {
    ...selectionState(identity),
    choices,
    nextCursor: grants.length > pageSize ? grants[pageSize - 1]?.id : undefined,
  }
}

export async function listAssistantWhatsAppStores(
  db: DbClient,
  actor: WhatsAppPersonalActor,
  phoneNumberId: string,
  input: StorePage,
  now = new Date(),
) {
  const identity = await requireOwnedIdentity(
    db,
    actor,
    input.identityId,
    phoneNumberId,
    now,
  )
  const grant = await requireOwnedGrant(db, identity.id, input.grantId, now)
  const context = await choicesContext(db, actor.userId, grant)
  const stores = context.stores
    .filter(
      (store) =>
        store.status === "ACTIVE" && (!input.cursor || store.id > input.cursor),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, pageSize + 1)
  return {
    ...selectionState(identity),
    grantId: grant.id,
    grantGeneration: grant.generation,
    selectedStoreId: grant.storeId,
    choices: stores
      .slice(0, pageSize)
      .map((store) => ({ id: store.id, name: store.name })),
    nextCursor: stores.length > pageSize ? stores[pageSize - 1]?.id : undefined,
  }
}

/** Lists metadata only; no message body, draft or private media is a picker label. */
export async function listAssistantWhatsAppChats(
  db: DbClient,
  actor: WhatsAppPersonalActor,
  phoneNumberId: string,
  input: ChatPage,
  now = new Date(),
) {
  const identity = await requireOwnedIdentity(
    db,
    actor,
    input.identityId,
    phoneNumberId,
    now,
  )
  const grant = await requireOwnedGrant(db, identity.id, input.grantId, now)
  const context = await requireWhatsAppActorScope(db, {
    userId: actor.userId,
    tenantId: grant.tenantId,
    membershipId: grant.membershipId,
    storeId: input.storeId,
  })
  const chats = await db.assistantConversation.findMany({
    where: {
      ownerUserId: actor.userId,
      tenantId: grant.tenantId,
      storeId: input.storeId,
      status: "ACTIVE",
      ...(!["OWNER", "ADMIN"].includes(context.membership.role)
        ? { purpose: "GENERAL" as const }
        : {}),
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: pageSize + 1,
    select: { id: true, purpose: true, updatedAt: true },
  })
  return {
    ...selectionState(identity),
    grantId: grant.id,
    grantGeneration: grant.generation,
    choices: chats.slice(0, pageSize).map((chat) => ({
      ...chat,
      channelRuntime:
        chat.purpose === "GENERAL"
          ? ("source" as const)
          : ("app_review" as const),
    })),
    nextCursor: chats.length > pageSize ? chats[pageSize - 1]?.id : undefined,
  }
}

function digest(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex")
}

/** One real browser actor selects channel scope; this never changes app-wide Store preferences. */
export function selectAssistantWhatsAppScope(
  db: PrismaClient,
  actor: WhatsAppPersonalActor,
  phoneNumberId: string,
  unparsedInput: WhatsAppScopeSelection,
  now = new Date(),
) {
  const input = whatsAppScopeSelectionSchema.parse(unparsedInput)
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE id=${input.identityId} AND "userId"=${actor.userId} AND "phoneNumberId"=${phoneNumberId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${actor.sessionId} AND "userId"=${actor.userId} FOR SHARE`
    const identity = await requireOwnedIdentity(
      tx,
      actor,
      input.identityId,
      phoneNumberId,
      now,
    )
    return selectAssistantWhatsAppScopeForIdentityInTransaction(
      tx,
      identity,
      input,
      now,
    )
  })
}

/** Internal only: caller holds this freshly verified identity's row lock. No browser impersonation. */
export async function selectAssistantWhatsAppScopeForIdentityInTransaction(
  tx: Prisma.TransactionClient,
  identity: AssistantWhatsAppIdentity,
  input: WhatsAppScopeSelection,
  now: Date,
) {
  const phoneNumberId = identity.phoneNumberId
  const operationDigest = digest([identity.id, input.requestId])
  const requestDigest = digest([input.grantId, input.storeId, input.action])
  const receipt = await tx.assistantWhatsAppSelection.findUnique({
    where: { operationDigest },
  })
  if (receipt) {
    if (receipt.requestDigest !== requestDigest)
      throw new AssistantWhatsAppError("CONFLICT")
    const binding =
      identity.activeBindingId === receipt.bindingId
        ? await tx.assistantWhatsAppBinding.findFirst({
            where: { id: receipt.bindingId, identityId: identity.id },
            select: { id: true },
          })
        : null
    if (!binding)
      return {
        state: "superseded" as const,
        replay: true,
        identityId: identity.id,
        bindingId: receipt.bindingId,
      }
  }
  const grant = await requireOwnedGrant(tx, identity.id, input.grantId, now)
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${grant.membershipId} AND "tenantId"=${grant.tenantId} AND "userId"=${identity.userId} FOR SHARE`
  await requireWhatsAppActorScope(tx, {
    userId: identity.userId,
    tenantId: grant.tenantId,
    membershipId: grant.membershipId,
    storeId: input.storeId,
  })
  if (
    !receipt &&
    (identity.generation !== input.expectedIdentityGeneration ||
      identity.selectionGeneration !== input.expectedSelectionGeneration ||
      grant.generation !== input.expectedGrantGeneration)
  )
    throw new AssistantWhatsAppError("CONFLICT")

  let principal: WhatsAppGrantPrincipal = {
    kind: "linked_whatsapp",
    phoneNumberId,
    senderId: identity.senderId,
    grantId: grant.id,
    grantGeneration: grant.generation,
    identityGeneration: identity.generation,
  }
  if (receipt) {
    const current = await resolveAssistantWhatsAppConversation(
      tx,
      {
        ...principal,
        bindingId: receipt.bindingId,
        selectionGeneration: identity.selectionGeneration,
      },
      now,
    )
    return {
      state: "selected" as const,
      replay: true,
      ...selectionState(identity),
      bindingId: current.binding.id,
      grantId: grant.id,
      grantGeneration: grant.generation,
      tenantId: grant.tenantId,
      storeId: grant.storeId,
      conversationId: current.conversation.id,
      purpose: current.conversation.purpose,
    }
  }
  if (grant.storeId !== input.storeId) {
    const changed = await tx.assistantWhatsAppGrant.update({
      where: { id: grant.id },
      data: { storeId: input.storeId, generation: { increment: 1 } },
    })
    principal = { ...principal, grantGeneration: changed.generation }
  }
  const conversation =
    input.action.kind === "new"
      ? await tx.assistantConversation.create({
          data: {
            id: `wa-chat_${operationDigest}`,
            ownerUserId: identity.userId,
            tenantId: grant.tenantId,
            storeId: input.storeId,
            purpose: "GENERAL",
            status: "ACTIVE",
          },
          select: { id: true, purpose: true },
        })
      : await tx.assistantConversation.findFirst({
          where: {
            id: input.action.conversationId,
            ownerUserId: identity.userId,
            tenantId: grant.tenantId,
            storeId: input.storeId,
            purpose: input.action.purpose,
            status: "ACTIVE",
          },
          select: { id: true, purpose: true },
        })
  if (!conversation) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const selected = await selectAssistantWhatsAppConversationInTransaction(
    tx,
    principal,
    conversation.id,
    now,
  )
  await tx.assistantWhatsAppSelection.create({
    data: {
      identityId: identity.id,
      operationDigest,
      requestDigest,
      bindingId: selected.bindingId,
    },
  })
  return {
    state: "selected" as const,
    replay: false,
    identityId: identity.id,
    identityGeneration: identity.generation,
    selectionGeneration: selected.selectionGeneration,
    bindingId: selected.bindingId,
    grantId: grant.id,
    grantGeneration: selected.grantGeneration,
    tenantId: grant.tenantId,
    storeId: input.storeId,
    conversationId: conversation.id,
    purpose: conversation.purpose,
  }
}
