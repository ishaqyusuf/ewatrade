import {
  maskWhatsAppSender,
  whatsAppGrantIdleMs,
} from "@ewatrade/assistant/channels/whatsapp"
import type {
  AssistantWhatsAppGrant,
  PrismaClient,
} from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  AssistantWhatsAppError,
  type WhatsAppPersonalActor,
  requireWhatsAppActorScope,
  requireWhatsAppPersonalActor,
} from "./authority"
import { invalidateAssistantWhatsAppGrantInTransaction } from "./lifecycle"

export type WhatsAppGrantPrincipal = {
  kind: "linked_whatsapp"
  grantId: string
  grantGeneration: number
  identityGeneration: number
  phoneNumberId: string
  senderId: string
}

/** Bounded choices only for this verified sender; never infer grants from Customer/User.phone. */
export async function listAssistantWhatsAppScopes(
  db: DbClient,
  input: { phoneNumberId: string; senderId: string },
  now = new Date(),
) {
  const grants = await db.assistantWhatsAppGrant.findMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: now },
      idleExpiresAt: { gt: now },
      identity: {
        phoneNumberId: input.phoneNumberId,
        senderId: input.senderId,
        revokedAt: null,
      },
    },
    orderBy: { createdAt: "asc" },
    take: 11,
    include: { identity: { select: { generation: true } } },
  })
  const choices = []
  for (const grant of grants.slice(0, 10)) {
    const principal: WhatsAppGrantPrincipal = {
      kind: "linked_whatsapp",
      grantId: grant.id,
      grantGeneration: grant.generation,
      identityGeneration: grant.identity.generation,
      ...input,
    }
    try {
      const resolved = await resolveAssistantWhatsAppGrant(db, principal, now)
      choices.push({
        principal,
        businessName: resolved.tenantContext.tenant.name,
        storeName: resolved.tenantContext.activeStore?.name ?? "Store",
        storeId: resolved.scope.storeId,
      })
    } catch (error) {
      if (
        !(error instanceof AssistantWhatsAppError) ||
        error.code !== "UNAUTHORIZED"
      )
        throw error
    }
  }
  return { choices, hasMore: grants.length > 10 }
}

/** Persisted identity and current membership are authoritative, never Redis or a phone match. */
export async function resolveAssistantWhatsAppGrant(
  db: DbClient,
  principal: WhatsAppGrantPrincipal,
  now = new Date(),
) {
  const grant = await db.assistantWhatsAppGrant.findFirst({
    where: {
      id: principal.grantId,
      generation: principal.grantGeneration,
      revokedAt: null,
      expiresAt: { gt: now },
      idleExpiresAt: { gt: now },
      identity: {
        generation: principal.identityGeneration,
        phoneNumberId: principal.phoneNumberId,
        senderId: principal.senderId,
        revokedAt: null,
      },
    },
    include: {
      identity: { select: { id: true, userId: true, generation: true } },
    },
  })
  if (!grant) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const scope = {
    userId: grant.identity.userId,
    tenantId: grant.tenantId,
    storeId: grant.storeId,
    membershipId: grant.membershipId,
  }
  const tenantContext = await requireWhatsAppActorScope(db, scope)
  return { principal, scope, tenantContext, grant }
}

export async function listAssistantWhatsAppGrants(
  db: DbClient,
  actor: WhatsAppPersonalActor,
  phoneNumberId?: string,
  now = new Date(),
  cursor?: string,
) {
  await requireWhatsAppPersonalActor(db, actor, now)
  const grants = await db.assistantWhatsAppGrant.findMany({
    where: {
      identity: { userId: actor.userId, phoneNumberId },
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: 20,
    include: {
      tenant: { select: { name: true } },
      store: { select: { name: true } },
      identity: {
        select: {
          id: true,
          generation: true,
          selectionGeneration: true,
          senderId: true,
          revokedAt: true,
        },
      },
    },
  })
  return grants.map((grant) => ({
    id: grant.id,
    tenantId: grant.tenantId,
    businessName: grant.tenant.name,
    storeName: grant.store.name,
    consentedAt: grant.consentedAt,
    storeId: grant.storeId,
    generation: grant.generation,
    identityId: grant.identity.id,
    identityGeneration: grant.identity.generation,
    selectionGeneration: grant.identity.selectionGeneration,
    expiresAt: grant.expiresAt,
    idleExpiresAt: grant.idleExpiresAt,
    maskedSender: maskWhatsAppSender(grant.identity.senderId),
    active:
      !grant.revokedAt &&
      !grant.identity.revokedAt &&
      grant.expiresAt > now &&
      grant.idleExpiresAt > now,
  }))
}

export function revokeAssistantWhatsAppGrant(
  db: PrismaClient,
  actor: WhatsAppPersonalActor,
  grantId: string,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${actor.sessionId} AND "userId"=${actor.userId} FOR SHARE`
    await requireWhatsAppPersonalActor(tx, actor, now)
    await tx.$queryRaw`SELECT i.id FROM "AssistantWhatsAppIdentity" i JOIN "AssistantWhatsAppGrant" g ON g."identityId"=i.id WHERE g.id=${grantId} AND i."userId"=${actor.userId} FOR UPDATE OF i`
    const grant = await tx.assistantWhatsAppGrant.findFirst({
      where: {
        id: grantId,
        identity: { userId: actor.userId },
      },
      include: { identity: true },
    })
    if (!grant) throw new AssistantWhatsAppError("UNAVAILABLE")
    await invalidateAssistantWhatsAppGrantInTransaction(
      tx,
      grant.identity,
      grant,
      "GRANT_REVOKED",
      now,
    )
    if (!grant.revokedAt)
      await tx.assistantWhatsAppLink.updateMany({
        where: {
          userId: actor.userId,
          tenantId: grant.tenantId,
          phoneNumberId: grant.identity.phoneNumberId,
          confirmedAt: null,
          cancelledAt: null,
        },
        data: { cancelledAt: now, revision: { increment: 1 } },
      })
    return { revoked: true as const }
  })
}

/** A touch cannot revive expired/revoked access or an older Store selection. */
export async function touchAssistantWhatsAppGrant(
  db: DbClient,
  principal: WhatsAppGrantPrincipal,
  now = new Date(),
) {
  const { grant } = await resolveAssistantWhatsAppGrant(db, principal, now)
  return touchAssistantWhatsAppActivity(
    db,
    grant,
    principal.identityGeneration,
    now,
  )
}

/** Package-private: callers hold the identity lock and have just resolved current scope. */
export async function touchAssistantWhatsAppActivity(
  db: DbClient,
  grant: AssistantWhatsAppGrant,
  identityGeneration: number,
  now: Date,
  activityAt = now,
) {
  const usedAt = new Date(Math.min(activityAt.getTime(), now.getTime()))
  if (grant.lastUsedAt >= usedAt) return
  const changed = await db.assistantWhatsAppGrant.updateMany({
    where: {
      id: grant.id,
      generation: grant.generation,
      revokedAt: null,
      expiresAt: { gt: now },
      idleExpiresAt: { gt: now },
      lastUsedAt: { lte: usedAt },
      identity: {
        id: grant.identityId,
        generation: identityGeneration,
        revokedAt: null,
      },
    },
    data: {
      lastUsedAt: usedAt,
      idleExpiresAt: new Date(
        Math.min(
          grant.expiresAt.getTime(),
          Math.max(
            grant.idleExpiresAt.getTime(),
            usedAt.getTime() + whatsAppGrantIdleMs,
          ),
        ),
      ),
    },
  })
  if (changed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
}
