import { createHash } from "node:crypto"
import {
  type WhatsAppControlMenu,
  serializeWhatsAppControlMenu,
} from "@ewatrade/assistant/channels/controls"
import { assistantWhatsAppPilotTenantIds } from "@ewatrade/assistant/channels/policy"
import type { AssistantWhatsAppIdentity } from "../../../generated/prisma/client"
import type { DbClient } from "../types"
import { AssistantWhatsAppError, requireWhatsAppActorScope } from "./authority"
import { resolveAssistantWhatsAppConversation } from "./conversations"
import { assistantWhatsAppScopeAuthorityDigest } from "./execution"
import { choicesContext } from "./scope-controls"

/** Shared by staging and exact-body verification; only trusted server configuration. */
export function assistantWhatsAppControlRenderOptions(
  menu: WhatsAppControlMenu,
) {
  return menu.conversationTarget
    ? {
        trustedAppOrigin:
          process.env.DASHBOARD_URL ??
          process.env.NEXT_PUBLIC_DASHBOARD_URL ??
          "https://dash.ewatrade.com",
        currentScope: menu.conversationTarget.origin,
      }
    : undefined
}

export const liveControlGrant = (now: Date) => ({
  revokedAt: null,
  expiresAt: { gt: now },
  idleExpiresAt: { gt: now },
})
export async function readControlScope(
  db: DbClient,
  identity: AssistantWhatsAppIdentity,
  grantId: string,
  storeId: string | undefined,
  now: Date,
  generation?: number,
) {
  const grant = await db.assistantWhatsAppGrant.findFirst({
    where: {
      id: grantId,
      identityId: identity.id,
      ...liveControlGrant(now),
      ...(generation !== undefined ? { generation } : {}),
    },
  })
  if (!grant) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const context = storeId
    ? await requireWhatsAppActorScope(db, {
        userId: identity.userId,
        tenantId: grant.tenantId,
        membershipId: grant.membershipId,
        storeId,
      })
    : await choicesContext(db, identity.userId, grant)
  if (!context.activeStore) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return {
    grant,
    context,
    proof: {
      grantId: grant.id,
      grantGeneration: grant.generation,
      storeId: context.activeStore.id,
    },
    scope: {
      userId: identity.userId,
      tenantId: grant.tenantId,
      membershipId: grant.membershipId,
      storeId: context.activeStore.id,
    },
  }
}

/** Personal navigation can recover Store access; this read-only quota anchor never selects a business. */
export async function primaryControlScope(
  db: DbClient,
  identity: AssistantWhatsAppIdentity,
  now: Date,
) {
  const grant = await db.assistantWhatsAppGrant.findFirst({
    where: {
      identityId: identity.id,
      tenantId: { in: assistantWhatsAppPilotTenantIds() },
      ...liveControlGrant(now),
      tenant: {
        isActive: true,
        qaPurgeStartedAt: null,
        stores: { some: { status: "ACTIVE" } },
      },
      membership: {
        userId: identity.userId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"] },
        OR: [
          { role: { in: ["OWNER", "ADMIN"] } },
          { staffAccessMode: "LEGACY" },
          {
            staffStoreAssignments: {
              some: { status: "ACTIVE", store: { status: "ACTIVE" } },
            },
          },
        ],
      },
    },
    orderBy: { id: "asc" },
    select: { id: true },
  })
  if (!grant) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return readControlScope(db, identity, grant.id, undefined, now)
}

/** Recompute every displayed scope from canonical policy, including while the selected chat is inaccessible. */
export async function assistantWhatsAppControlAuthorityDigest(
  db: DbClient,
  identity: AssistantWhatsAppIdentity,
  menu: WhatsAppControlMenu,
  now: Date,
) {
  return (
    await resolveAssistantWhatsAppControlAuthority(db, identity, menu, now)
  ).digest
}

export async function resolveAssistantWhatsAppControlAuthority(
  db: DbClient,
  identity: AssistantWhatsAppIdentity,
  menu: WhatsAppControlMenu,
  now: Date,
) {
  if (
    identity.revokedAt ||
    identity.generation !== menu.identityGeneration ||
    identity.selectionGeneration !== menu.selectionGeneration
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (
    !menu.scopes.some(
      (scope) =>
        scope.grantId === menu.quotaScope.grantId &&
        scope.grantGeneration === menu.quotaScope.grantGeneration &&
        scope.storeId === menu.quotaScope.storeId,
    )
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const stamps = []
  const classifications = new Set<"QA" | "LIVE">()
  let quota: Awaited<ReturnType<typeof readControlScope>> | undefined
  let dispatchBefore = Number.POSITIVE_INFINITY
  for (const proof of menu.scopes) {
    const resolved = await readControlScope(
      db,
      identity,
      proof.grantId,
      proof.storeId,
      now,
      proof.grantGeneration,
    )
    await db.$queryRaw`SELECT id FROM "Membership" WHERE id=${resolved.grant.membershipId} AND "userId"=${identity.userId} FOR SHARE`
    classifications.add(resolved.context.tenant.dataClassification)
    dispatchBefore = Math.min(
      dispatchBefore,
      resolved.grant.expiresAt.getTime(),
      resolved.grant.idleExpiresAt.getTime(),
    )
    if (
      proof.grantId === menu.quotaScope.grantId &&
      proof.storeId === menu.quotaScope.storeId &&
      proof.grantGeneration === menu.quotaScope.grantGeneration
    )
      quota = resolved
    stamps.push(
      await assistantWhatsAppScopeAuthorityDigest(db, {
        scope: resolved.scope,
        tenantContext: resolved.context,
        purpose: "GENERAL",
      }),
    )
  }
  if (!quota) throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (menu.conversationTarget) {
    const binding = identity.activeBindingId
      ? await db.assistantWhatsAppBinding.findFirst({
          where: { id: identity.activeBindingId, identityId: identity.id },
        })
      : null
    if (!binding) throw new AssistantWhatsAppError("UNAUTHORIZED")
    const selected = await resolveAssistantWhatsAppConversation(
      db,
      {
        kind: "linked_whatsapp",
        phoneNumberId: identity.phoneNumberId,
        senderId: identity.senderId,
        grantId: binding.grantId,
        grantGeneration: binding.grantGeneration,
        identityGeneration: binding.identityGeneration,
        bindingId: binding.id,
        selectionGeneration: binding.selectionGeneration,
      },
      now,
    )
    if (
      selected.conversation.purpose !== "GENERAL" ||
      selected.conversation.id !== menu.conversationTarget.conversationId ||
      selected.scope.tenantId !== menu.conversationTarget.origin.tenantId ||
      selected.scope.storeId !== menu.conversationTarget.origin.storeId ||
      !menu.scopes.some(
        (proof) =>
          proof.grantId === selected.grant.id &&
          proof.grantGeneration === selected.grant.generation &&
          proof.storeId === selected.scope.storeId,
      )
    )
      throw new AssistantWhatsAppError("UNAUTHORIZED")
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        version: "whatsapp-control-authority-v1",
        identityId: identity.id,
        menu: serializeWhatsAppControlMenu(menu),
        stamps,
      }),
    )
    .digest("hex")
  return {
    digest,
    quota,
    classifications: [...classifications],
    dispatchBefore: new Date(dispatchBefore),
  }
}
