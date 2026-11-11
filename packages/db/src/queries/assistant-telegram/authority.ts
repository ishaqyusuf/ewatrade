import { createHash } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import {
  type AssistantChannelScope,
  readAssistantChannelScope,
} from "../assistant-channel-authority"
import { generalConversationWhere } from "../assistant-general"
import { readStaffStoreAccess } from "../staff-store-access"
import type { DbClient } from "../types"

export class AssistantTelegramError extends Error {
  constructor(
    readonly code:
      | "UNAVAILABLE"
      | "UNAUTHORIZED"
      | "CONFLICT"
      | "EXPIRED"
      | "RATE_LIMITED",
  ) {
    super(
      {
        UNAVAILABLE: "Telegram assistant connection unavailable.",
        UNAUTHORIZED: "Sign in again or choose an accessible Store.",
        CONFLICT: "This connection changed. Start a new link.",
        EXPIRED: "This connection expired. Start a new link.",
        RATE_LIMITED: "Too many connection attempts. Try again later.",
      }[code],
    )
    this.name = "AssistantTelegramError"
  }
}

export type TelegramPersonalActor = { userId: string; sessionId: string }
export type TelegramWebActor = AssistantChannelScope & TelegramPersonalActor
export type TelegramSender = { botId: string; userId: string; chatId: string }
export type TelegramConversationPrincipal = TelegramSender & {
  identityId: string
  bindingId: string
  grantId: string
  identityGeneration: number
  grantGeneration: number
  selectionGeneration: number
}
export type TelegramInboxLease = {
  inboxId: string
  bindingId: string
  owner: string
  generation: number
}

export const isTelegramId = (value: string) => /^[1-9]\d{0,15}$/.test(value)
export const isTelegramUpdateId = (value: string) =>
  /^(0|[1-9]\d{0,15})$/.test(value)
export const telegramDigest = (purpose: string, value: unknown) =>
  createHash("sha256")
    .update(`assistant-telegram:${purpose}:v1\0`)
    .update(JSON.stringify(value))
    .digest("hex")

export function lockTelegramSender(
  tx: Prisma.TransactionClient,
  sender: Pick<TelegramSender, "botId" | "userId">,
) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assistant-telegram:${sender.botId}:${sender.userId}`}))`
}

export async function requireTelegramSession(
  db: DbClient,
  actor: TelegramPersonalActor,
  now: Date,
  fresh = false,
) {
  const session = await db.session.findFirst({
    where: {
      id: actor.sessionId,
      userId: actor.userId,
      expiresAt: { gt: now },
      qaAuthorizationId: null,
      NOT: { token: { startsWith: "qas_" } },
      ...(fresh
        ? {
            createdAt: { gte: new Date(now.getTime() - 10 * 60_000), lte: now },
          }
        : {}),
    },
    select: { id: true },
  })
  if (!session) throw new AssistantTelegramError("UNAUTHORIZED")
}

export async function requireTelegramScope(
  db: DbClient,
  scope: AssistantChannelScope,
) {
  const context = await readAssistantChannelScope(db, scope)
  if (!context) throw new AssistantTelegramError("UNAUTHORIZED")
  return context
}

export function telegramInboxLeaseWhere(lease: TelegramInboxLease, now: Date) {
  return {
    id: lease.inboxId,
    bindingId: lease.bindingId,
    state: "PROCESSING" as const,
    leaseOwner: lease.owner,
    leaseGeneration: lease.generation,
    leaseExpiresAt: { gt: now },
    expiresAt: { gt: now },
  }
}

export function telegramPrincipal(binding: {
  id: string
  grantId: string
  identityGeneration: number
  grantGeneration: number
  selectionGeneration: number
  identity: {
    id: string
    botId: string
    telegramUserId: string
    chatId: string
  }
}): TelegramConversationPrincipal {
  return {
    identityId: binding.identity.id,
    botId: binding.identity.botId,
    userId: binding.identity.telegramUserId,
    chatId: binding.identity.chatId,
    bindingId: binding.id,
    grantId: binding.grantId,
    identityGeneration: binding.identityGeneration,
    grantGeneration: binding.grantGeneration,
    selectionGeneration: binding.selectionGeneration,
  }
}

export async function resolveAssistantTelegramConversation(
  db: DbClient,
  principal: TelegramConversationPrincipal,
  lease?: TelegramInboxLease,
  now = new Date(),
) {
  const binding = await db.assistantTelegramBinding.findFirst({
    where: {
      id: principal.bindingId,
      identityId: principal.identityId,
      grantId: principal.grantId,
      identityGeneration: principal.identityGeneration,
      grantGeneration: principal.grantGeneration,
      selectionGeneration: principal.selectionGeneration,
      identity: {
        botId: principal.botId,
        telegramUserId: principal.userId,
        chatId: principal.chatId,
        generation: principal.identityGeneration,
        selectionGeneration: principal.selectionGeneration,
        activeBindingId: principal.bindingId,
        revokedAt: null,
      },
      grant: {
        identityId: principal.identityId,
        generation: principal.grantGeneration,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
    },
    include: {
      identity: { select: { userId: true } },
      grant: true,
      conversation: {
        select: {
          id: true,
          ownerUserId: true,
          tenantId: true,
          storeId: true,
          purpose: true,
          status: true,
        },
      },
    },
  })
  if (!binding) throw new AssistantTelegramError("UNAUTHORIZED")
  const { identity, grant, conversation } = binding
  const scope = {
    userId: identity.userId,
    tenantId: grant.tenantId,
    storeId: grant.storeId,
    membershipId: grant.membershipId,
  }
  const expected = generalConversationWhere(scope)
  if (
    conversation.ownerUserId !== expected.ownerUserId ||
    conversation.tenantId !== expected.tenantId ||
    conversation.storeId !== expected.storeId ||
    conversation.purpose !== expected.purpose ||
    conversation.status !== expected.status
  )
    throw new AssistantTelegramError("UNAUTHORIZED")
  const tenantContext = await requireTelegramScope(db, scope)
  const resolved = { scope, tenantContext, conversation, binding }
  if (lease) {
    if (lease.bindingId !== binding.id)
      throw new AssistantTelegramError("UNAUTHORIZED")
    const row = await db.assistantTelegramInbox.findFirst({
      where: telegramInboxLeaseWhere(lease, now),
      select: { executionAuthorityDigest: true },
    })
    if (
      !row ||
      (row.executionAuthorityDigest &&
        row.executionAuthorityDigest !==
          (await assistantTelegramAuthorityDigest(db, resolved)))
    )
      throw new AssistantTelegramError("UNAUTHORIZED")
  }
  return resolved
}

export type ResolvedTelegramConversation = Awaited<
  ReturnType<typeof resolveAssistantTelegramConversation>
>

export async function lockAssistantTelegramConversation(
  tx: Prisma.TransactionClient,
  principal: TelegramConversationPrincipal,
  lease?: TelegramInboxLease,
  now = new Date(),
) {
  await tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE id=${principal.identityId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "AssistantTelegramGrant" WHERE id=${principal.grantId} FOR SHARE`
  if (lease)
    await tx.$queryRaw`SELECT id FROM "AssistantTelegramInbox" WHERE id=${lease.inboxId} FOR SHARE`
  await tx.$queryRaw`SELECT m.id FROM "Membership" m JOIN "AssistantTelegramGrant" g ON g."membershipId"=m.id AND g."tenantId"=m."tenantId" WHERE g.id=${principal.grantId} FOR SHARE OF m`
  return resolveAssistantTelegramConversation(tx, principal, lease, now)
}

export async function assistantTelegramAuthorityDigest(
  db: DbClient,
  resolved: ResolvedTelegramConversation,
) {
  const { scope, tenantContext, binding } = resolved
  const policy = await readStaffStoreAccess(
    db,
    scope.membershipId,
    scope.tenantId,
  )
  if (!policy) throw new AssistantTelegramError("UNAUTHORIZED")
  return telegramDigest("authority", {
    scope,
    binding: [
      binding.id,
      binding.identityGeneration,
      binding.grantGeneration,
      binding.selectionGeneration,
    ],
    role: tenantContext.membership.role,
    businessRole: policy.role,
    status: policy.status,
    mode: policy.staffAccessMode,
    catalogEditor: policy.catalogEditor,
    revision: policy.staffAccessRevision,
    assignments: [...policy.staffStoreAssignments]
      .sort((a, b) => a.storeId.localeCompare(b.storeId))
      .map(({ storeId, role, status, revision }) => ({
        storeId,
        role,
        status,
        revision,
      })),
    type: tenantContext.tenant.type,
    modes: [...tenantContext.tenant.enabledModes].sort(),
    plan: tenantContext.tenant.retailOpsPlanId ?? null,
    classification: tenantContext.tenant.dataClassification,
    tenantCurrency: tenantContext.tenant.currencyCode,
    storeCurrency: tenantContext.activeStore?.currencyCode,
  })
}

export async function stampAssistantTelegramExecution(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  resolved: ResolvedTelegramConversation,
  now = new Date(),
) {
  if (lease.bindingId !== resolved.binding.id)
    throw new AssistantTelegramError("UNAUTHORIZED")
  const digest = await assistantTelegramAuthorityDigest(tx, resolved)
  const updated = await tx.assistantTelegramInbox.updateMany({
    where: {
      ...telegramInboxLeaseWhere(lease, now),
      OR: [
        { executionAuthorityDigest: null },
        { executionAuthorityDigest: digest },
      ],
    },
    data: { executionAuthorityDigest: digest },
  })
  if (updated.count !== 1) throw new AssistantTelegramError("UNAUTHORIZED")
  return digest
}
