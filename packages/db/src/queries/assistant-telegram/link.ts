import { randomBytes } from "node:crypto"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { startGeneralConversation } from "../assistant-general"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  AssistantTelegramError,
  type TelegramPersonalActor,
  type TelegramSender,
  type TelegramWebActor,
  isTelegramId,
  isTelegramUpdateId,
  lockTelegramSender,
  requireTelegramScope,
  requireTelegramSession,
  telegramDigest,
} from "./authority"

const linkLifetime = 5 * 60_000
const grantLifetime = 30 * 24 * 60 * 60_000
export const telegramGrantIdleTime = 7 * 24 * 60 * 60_000
export const maskAssistantTelegramSender = (id: string) => `••••${id.slice(-4)}`

/** Telegram profile text is user-controlled: keep printable, bounded text only. */
function claimDisplayName(value: string | null | undefined) {
  const text = (value ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
  return text ? text.slice(0, 128) : null
}
function claimUsername(value: string | null | undefined) {
  return value && /^[A-Za-z0-9_]{4,32}$/.test(value) ? value : null
}
/** The pinned "Connected" message from the confirmation that opened this chat's access. */
async function connectedMessage(
  db: DbClient,
  where: {
    botId: string
    telegramUserId: string
    chatId: string
    tenantId?: string
  },
) {
  const link = await db.assistantTelegramLink.findFirst({
    where: {
      botId: where.botId,
      claimedTelegramUserId: where.telegramUserId,
      claimedChatId: where.chatId,
      ...(where.tenantId ? { tenantId: where.tenantId } : {}),
      confirmedAt: { not: null },
      claimMessageId: { not: null },
    },
    orderBy: { confirmedAt: "desc" },
    select: {
      claimedChatId: true,
      claimMessageId: true,
      tenant: { select: { name: true } },
      store: { select: { name: true } },
    },
  })
  const message = link && claimMessage(link)
  return message && link
    ? { ...message, businessName: link.tenant.name, storeName: link.store.name }
    : null
}
export { connectedMessage as connectedTelegramMessage }

/**
 * Workshop c-second: this Telegram account is already connected to a different
 * EwaTrade user. Only a yes/no leaves this function; the other account is never named.
 */
async function heldByOtherAccount(
  db: DbClient,
  key: { botId: string; telegramUserId: string },
  userId: string,
) {
  return Boolean(
    await db.assistantTelegramIdentity.findFirst({
      where: { ...key, userId: { not: userId } },
      select: { id: true },
    }),
  )
}

/** Display details exist only while a claim waits for the merchant's decision. */
const clearedClaimDisplay = { claimedName: null, claimedUsername: null }

export type AssistantTelegramClaimMessage = {
  chatId: string
  messageId: string
}
function claimMessage(link: {
  claimedChatId: string | null
  claimMessageId: string | null
}): AssistantTelegramClaimMessage | null {
  return link.claimedChatId && link.claimMessageId
    ? { chatId: link.claimedChatId, messageId: link.claimMessageId }
    : null
}

async function requireWebActor(
  db: DbClient,
  actor: TelegramWebActor,
  now: Date,
  fresh: boolean,
) {
  await requireTelegramSession(db, actor, now, fresh)
  await requireTelegramScope(db, actor)
}

async function lockWebActor(
  tx: Prisma.TransactionClient,
  actor: TelegramWebActor,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${actor.membershipId} AND "tenantId"=${actor.tenantId} AND "userId"=${actor.userId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${actor.sessionId} AND "userId"=${actor.userId} FOR SHARE`
  await requireWebActor(tx, actor, now, true)
}

function linkScope(actor: TelegramWebActor, botId: string) {
  return {
    botId,
    userId: actor.userId,
    tenantId: actor.tenantId,
    storeId: actor.storeId,
    membershipId: actor.membershipId,
  }
}

export function createAssistantTelegramLink(
  db: PrismaClient,
  actor: TelegramWebActor,
  botId: string,
  now = new Date(),
) {
  if (!isTelegramId(botId)) throw new AssistantTelegramError("UNAVAILABLE")
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockWebActor(tx, actor, now)
    const recent = await tx.assistantTelegramLink.count({
      where: {
        userId: actor.userId,
        createdAt: { gte: new Date(now.getTime() - 15 * 60_000) },
      },
    })
    if (recent >= 10) throw new AssistantTelegramError("RATE_LIMITED")
    await tx.assistantTelegramLink.updateMany({
      where: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        botId,
        confirmedAt: null,
        cancelledAt: null,
      },
      data: { cancelledAt: now, revision: { increment: 1 } },
    })
    const code = randomBytes(32).toString("base64url")
    const link = await tx.assistantTelegramLink.create({
      data: {
        ...linkScope(actor, botId),
        tokenDigest: telegramDigest("link", code),
        expiresAt: new Date(now.getTime() + linkLifetime),
        createdAt: now,
      },
      select: { id: true, revision: true, expiresAt: true },
    })
    return { ...link, code }
  })
}

export type AssistantTelegramClaim = {
  linkId: string
  businessName: string
  storeName: string
  /** Already connected to another EwaTrade account: nothing can be confirmed. */
  busy?: true
}

export function claimAssistantTelegramLink(
  db: PrismaClient,
  input: TelegramSender & {
    updateId: string
    code: string
    occurredAt: Date
    name?: string | null
    username?: string | null
  },
  now = new Date(),
): Promise<AssistantTelegramClaim | false> {
  if (
    !isTelegramId(input.botId) ||
    !isTelegramId(input.userId) ||
    !isTelegramId(input.chatId) ||
    !isTelegramUpdateId(input.updateId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.code) ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    input.occurredAt.getTime() > now.getTime() + 30_000
  )
    return Promise.resolve(false)
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockTelegramSender(tx, input)
    const link = await tx.assistantTelegramLink.findUnique({
      where: { tokenDigest: telegramDigest("link", input.code) },
      include: {
        tenant: { select: { name: true } },
        store: { select: { name: true } },
      },
    })
    if (
      !link ||
      link.botId !== input.botId ||
      link.cancelledAt ||
      link.confirmedAt ||
      link.expiresAt <= now ||
      input.occurredAt.getTime() <
        Math.floor(link.createdAt.getTime() / 1000) * 1000
    )
      return false
    const claim: AssistantTelegramClaim = {
      linkId: link.id,
      businessName: link.tenant.name,
      storeName: link.store.name,
      ...((await heldByOtherAccount(
        tx,
        { botId: input.botId, telegramUserId: input.userId },
        link.userId,
      ))
        ? { busy: true as const }
        : {}),
    }
    if (link.claimedTelegramUserId)
      return link.claimedTelegramUserId === input.userId &&
        link.claimedChatId === input.chatId &&
        link.claimedUpdateId === input.updateId
        ? claim
        : false
    const updated = await tx.assistantTelegramLink.updateMany({
      where: {
        id: link.id,
        revision: link.revision,
        claimedTelegramUserId: null,
        cancelledAt: null,
        confirmedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        claimedTelegramUserId: input.userId,
        claimedChatId: input.chatId,
        claimedUpdateId: input.updateId,
        claimedName: claimDisplayName(input.name),
        claimedUsername: claimUsername(input.username),
        revision: { increment: 1 },
      },
    })
    return updated.count === 1 ? claim : false
  })
}

/** Remember the bot's claim reply so later decisions edit that same message. */
export async function recordAssistantTelegramClaimMessage(
  db: DbClient,
  input: TelegramSender & { linkId: string; messageId: string },
) {
  if (!isTelegramId(input.messageId)) return false
  const updated = await db.assistantTelegramLink.updateMany({
    where: {
      id: input.linkId,
      botId: input.botId,
      claimedTelegramUserId: input.userId,
      claimedChatId: input.chatId,
      claimMessageId: null,
    },
    data: { claimMessageId: input.messageId },
  })
  return updated.count === 1
}

export async function readAssistantTelegramLink(
  db: DbClient,
  actor: TelegramWebActor,
  linkId: string,
  botId: string,
  now = new Date(),
) {
  await requireWebActor(db, actor, now, false)
  const link = await db.assistantTelegramLink.findFirst({
    where: { ...linkScope(actor, botId), id: linkId },
  })
  if (!link) throw new AssistantTelegramError("UNAVAILABLE")
  return {
    id: link.id,
    revision: link.revision,
    expiresAt: link.expiresAt,
    state: link.cancelledAt
      ? ("cancelled" as const)
      : link.confirmedAt
        ? ("confirmed" as const)
        : link.expiresAt <= now
          ? ("expired" as const)
          : link.claimedTelegramUserId
            ? ("awaiting_confirmation" as const)
            : ("awaiting_telegram" as const),
    maskedSender: link.claimedTelegramUserId
      ? maskAssistantTelegramSender(link.claimedTelegramUserId)
      : null,
    busy: Boolean(
      link.claimedTelegramUserId &&
        !link.cancelledAt &&
        !link.confirmedAt &&
        link.expiresAt > now &&
        (await heldByOtherAccount(
          db,
          { botId: link.botId, telegramUserId: link.claimedTelegramUserId },
          actor.userId,
        )),
    ),
    ...(link.claimedTelegramUserId &&
    !link.cancelledAt &&
    !link.confirmedAt &&
    link.expiresAt > now
      ? { claimedName: link.claimedName, claimedUsername: link.claimedUsername }
      : { claimedName: null, claimedUsername: null }),
  }
}

export function confirmAssistantTelegramLink(
  db: PrismaClient,
  actor: TelegramWebActor,
  input: { linkId: string; revision: number; botId: string },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const link = await tx.assistantTelegramLink.findFirst({
      where: { ...linkScope(actor, input.botId), id: input.linkId },
    })
    if (!link?.claimedTelegramUserId || !link.claimedChatId || link.cancelledAt)
      throw new AssistantTelegramError("UNAVAILABLE")
    const key = {
      botId: link.botId,
      telegramUserId: link.claimedTelegramUserId,
    }
    await lockTelegramSender(tx, {
      botId: key.botId,
      userId: key.telegramUserId,
    })
    await tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE "botId"=${key.botId} AND "telegramUserId"=${key.telegramUserId} FOR UPDATE`
    await lockWebActor(tx, actor, now)
    if (link.confirmedAt) {
      if (link.revision !== input.revision + 1)
        throw new AssistantTelegramError("CONFLICT")
      const grant = await tx.assistantTelegramGrant.findFirst({
        where: {
          tenantId: actor.tenantId,
          membershipId: actor.membershipId,
          storeId: actor.storeId,
          generation: link.confirmedGrantGeneration ?? -1,
          consentedAt: link.confirmedAt,
          expiresAt: { gt: now },
          idleExpiresAt: { gt: now },
          revokedAt: null,
          identity: {
            ...key,
            userId: actor.userId,
            chatId: link.claimedChatId,
            revokedAt: null,
          },
        },
        select: { id: true, generation: true, expiresAt: true },
      })
      if (!grant) throw new AssistantTelegramError("CONFLICT")
      // A retried confirmation already edited the claim message.
      return {
        ...grant,
        maskedSender: maskAssistantTelegramSender(key.telegramUserId),
        claimMessage: null,
        previousScope: null,
      }
    }
    if (link.expiresAt <= now) throw new AssistantTelegramError("EXPIRED")
    if (link.revision !== input.revision)
      throw new AssistantTelegramError("CONFLICT")
    const existing = await tx.assistantTelegramIdentity.findUnique({
      where: { botId_telegramUserId: key },
    })
    if (
      existing &&
      (existing.userId !== actor.userId ||
        existing.chatId !== link.claimedChatId)
    )
      throw new AssistantTelegramError("CONFLICT")
    // Workshop c-switch: the scope this chat used until now, read before the
    // grant upsert below can move a same-business grant to the new Store.
    const replaced =
      existing && !existing.revokedAt && existing.activeBindingId
        ? await tx.assistantTelegramBinding.findFirst({
            where: { id: existing.activeBindingId, identityId: existing.id },
            select: {
              grant: {
                select: {
                  tenantId: true,
                  storeId: true,
                  tenant: { select: { name: true } },
                  store: { select: { name: true } },
                },
              },
            },
          })
        : null
    const previousScope = replaced
      ? {
          tenantId: replaced.grant.tenantId,
          storeId: replaced.grant.storeId,
          businessName: replaced.grant.tenant.name,
          storeName: replaced.grant.store.name,
        }
      : null
    const identity = existing
      ? await tx.assistantTelegramIdentity.update({
          where: { id: existing.id },
          data: {
            revokedAt: null,
            ...(existing.revokedAt ? { generation: { increment: 1 } } : {}),
          },
        })
      : await tx.assistantTelegramIdentity.create({
          data: { ...key, userId: actor.userId, chatId: link.claimedChatId },
        })
    const consent = {
      storeId: actor.storeId,
      membershipId: actor.membershipId,
      consentedAt: now,
      expiresAt: new Date(now.getTime() + grantLifetime),
      idleExpiresAt: new Date(now.getTime() + telegramGrantIdleTime),
      revokedAt: null,
    }
    const grant = await tx.assistantTelegramGrant.upsert({
      where: {
        identityId_tenantId: {
          identityId: identity.id,
          tenantId: actor.tenantId,
        },
      },
      create: { ...consent, identityId: identity.id, tenantId: actor.tenantId },
      update: { ...consent, generation: { increment: 1 } },
      select: { id: true, generation: true, expiresAt: true },
    })
    const confirmed = await tx.assistantTelegramLink.updateMany({
      where: {
        id: link.id,
        revision: input.revision,
        confirmedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now },
      },
      data: {
        confirmedAt: now,
        confirmedGrantGeneration: grant.generation,
        revision: { increment: 1 },
        ...clearedClaimDisplay,
      },
    })
    if (confirmed.count !== 1) throw new AssistantTelegramError("CONFLICT")
    const previous =
      identity.activeBindingId &&
      (await tx.assistantTelegramBinding.findFirst({
        where: {
          id: identity.activeBindingId,
          identityId: identity.id,
          conversation: {
            ownerUserId: actor.userId,
            tenantId: actor.tenantId,
            storeId: actor.storeId,
            purpose: "GENERAL",
            status: "ACTIVE",
          },
        },
        select: { conversationId: true },
      }))
    const conversationId = previous
      ? previous.conversationId
      : (await startGeneralConversation(tx, actor)).id
    const selectionGeneration = identity.selectionGeneration + 1
    const binding = await tx.assistantTelegramBinding.create({
      data: {
        identityId: identity.id,
        grantId: grant.id,
        conversationId,
        identityGeneration: identity.generation,
        grantGeneration: grant.generation,
        selectionGeneration,
      },
      select: { id: true },
    })
    await tx.assistantTelegramIdentity.update({
      where: { id: identity.id },
      data: { activeBindingId: binding.id, selectionGeneration },
    })
    await cancelTelegramWork(
      tx,
      { identityId: identity.id, id: { not: binding.id } },
      now,
    )
    return {
      ...grant,
      maskedSender: maskAssistantTelegramSender(key.telegramUserId),
      claimMessage: claimMessage(link),
      previousScope,
    }
  })
}

/** "This isn't me": close a claimed link without connecting anything. */
export function rejectAssistantTelegramLink(
  db: PrismaClient,
  actor: TelegramWebActor,
  input: { linkId: string; revision: number; botId: string },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockWebActor(tx, actor, now)
    const link = await tx.assistantTelegramLink.findFirst({
      where: { ...linkScope(actor, input.botId), id: input.linkId },
    })
    if (!link?.claimedTelegramUserId || link.confirmedAt || link.cancelledAt)
      throw new AssistantTelegramError("UNAVAILABLE")
    if (link.revision !== input.revision)
      throw new AssistantTelegramError("CONFLICT")
    const closed = await tx.assistantTelegramLink.updateMany({
      where: {
        id: link.id,
        revision: link.revision,
        confirmedAt: null,
        cancelledAt: null,
      },
      data: {
        cancelledAt: now,
        revision: { increment: 1 },
        ...clearedClaimDisplay,
      },
    })
    if (closed.count !== 1) throw new AssistantTelegramError("CONFLICT")
    return { claimMessage: claimMessage(link) }
  })
}

/**
 * Expiry is applied when someone next touches the link (no timer job). Returns
 * the claim message once so the caller can edit it to "expired".
 */
export function closeExpiredAssistantTelegramClaim(
  db: PrismaClient,
  actor: TelegramWebActor,
  input: { linkId: string; botId: string },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockWebActor(tx, actor, now)
    const link = await tx.assistantTelegramLink.findFirst({
      where: { ...linkScope(actor, input.botId), id: input.linkId },
    })
    if (!link || link.confirmedAt || link.cancelledAt || link.expiresAt > now)
      return null
    const message = claimMessage(link)
    await tx.assistantTelegramLink.updateMany({
      where: { id: link.id, claimMessageId: link.claimMessageId },
      data: { claimMessageId: null, ...clearedClaimDisplay },
    })
    return message
  })
}

/** Current connection for a Telegram sender, or null when the chat is not connected. */
export async function readAssistantTelegramConnection(
  db: DbClient,
  sender: TelegramSender,
  now = new Date(),
) {
  if (
    !isTelegramId(sender.botId) ||
    !isTelegramId(sender.userId) ||
    !isTelegramId(sender.chatId)
  )
    return null
  const identity = await db.assistantTelegramIdentity.findFirst({
    where: {
      botId: sender.botId,
      telegramUserId: sender.userId,
      chatId: sender.chatId,
      revokedAt: null,
    },
    select: { id: true, activeBindingId: true },
  })
  if (!identity?.activeBindingId) return null
  const binding = await db.assistantTelegramBinding.findFirst({
    where: {
      id: identity.activeBindingId,
      identityId: identity.id,
      grant: {
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
    },
    select: {
      grant: {
        select: {
          tenant: { select: { name: true } },
          store: { select: { name: true } },
        },
      },
    },
  })
  return binding
    ? {
        businessName: binding.grant.tenant.name,
        storeName: binding.grant.store.name,
      }
    : null
}

export async function cancelTelegramWork(
  tx: Prisma.TransactionClient,
  binding: Prisma.AssistantTelegramBindingWhereInput,
  now: Date,
) {
  await tx.assistantTelegramInbox.updateMany({
    where: { binding, state: { in: ["PENDING", "PROCESSING"] } },
    data: {
      state: "CANCELLED",
      content: Prisma.DbNull,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: "SCOPE_CHANGED",
      completedAt: now,
    },
  })
  await tx.assistantTelegramOutbox.updateMany({
    where: { inbox: { binding }, state: "PENDING" },
    data: {
      state: "CANCELLED",
      payload: Prisma.DbNull,
      errorCode: "SCOPE_CHANGED",
      completedAt: now,
    },
  })
}

export async function listAssistantTelegramGrants(
  db: DbClient,
  actor: TelegramPersonalActor,
  input: { botId?: string; cursor?: string },
  now = new Date(),
) {
  await requireTelegramSession(db, actor, now)
  const rows = await db.assistantTelegramGrant.findMany({
    where: {
      identity: {
        userId: actor.userId,
        ...(input.botId ? { botId: input.botId } : {}),
      },
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: 21,
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      expiresAt: true,
      idleExpiresAt: true,
      revokedAt: true,
      tenant: { select: { name: true } },
      store: { select: { name: true } },
      identity: { select: { telegramUserId: true } },
    },
  })
  const items = rows
    .slice(0, 20)
    .map(({ tenant, store, identity, ...row }) => ({
      ...row,
      tenantName: tenant.name,
      storeName: store.name,
      maskedSender: maskAssistantTelegramSender(identity.telegramUserId),
    }))
  return {
    items,
    nextCursor: rows.length > 20 ? (items.at(-1)?.id ?? null) : null,
  }
}

export function revokeAssistantTelegramGrant(
  db: PrismaClient,
  actor: TelegramPersonalActor,
  grantId: string,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await requireTelegramSession(tx, actor, now)
    const grant = await tx.assistantTelegramGrant.findFirst({
      where: { id: grantId, identity: { userId: actor.userId } },
      include: { identity: true },
    })
    if (!grant) throw new AssistantTelegramError("UNAVAILABLE")
    await tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE id=${grant.identityId} FOR UPDATE`
    if (grant.revokedAt) return { revoked: true as const }
    await tx.assistantTelegramGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, generation: { increment: 1 } },
    })
    const activeHere = Boolean(
      grant.identity.activeBindingId &&
        (await tx.assistantTelegramBinding.count({
          where: { id: grant.identity.activeBindingId, grantId },
        })),
    )
    if (activeHere)
      await tx.assistantTelegramIdentity.update({
        where: { id: grant.identityId },
        data: { activeBindingId: null, selectionGeneration: { increment: 1 } },
      })
    await cancelTelegramWork(tx, { grantId }, now)
    // Only a chat that was using this grant changes its pin and menu.
    if (!activeHere) return { revoked: true as const, connectedMessage: null }
    return {
      revoked: true as const,
      chatId: grant.identity.chatId,
      connectedMessage: await connectedMessage(tx, {
        botId: grant.identity.botId,
        telegramUserId: grant.identity.telegramUserId,
        chatId: grant.identity.chatId,
        tenantId: grant.tenantId,
      }),
    }
  })
}

export function disconnectAssistantTelegram(
  db: PrismaClient,
  input: TelegramSender & {
    updateId?: string
    messageId?: string
    occurredAt?: Date
  },
  now = new Date(),
) {
  const { updateId, occurredAt } = input
  const maxAge = 15 * 60_000
  if (
    (updateId !== undefined && !isTelegramUpdateId(updateId)) ||
    (occurredAt !== undefined &&
      (!Number.isFinite(occurredAt.getTime()) ||
        occurredAt.getTime() > now.getTime() + 30_000 ||
        occurredAt.getTime() <= now.getTime() - maxAge))
  )
    return Promise.resolve({ revoked: false as const })
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockTelegramSender(tx, input)
    if (
      updateId &&
      (await tx.assistantTelegramInbox.findUnique({
        where: { botId_updateId: { botId: input.botId, updateId } },
        select: { id: true },
      }))
    )
      return { revoked: false as const }
    await tx.assistantTelegramLink.updateMany({
      where: {
        botId: input.botId,
        claimedTelegramUserId: input.userId,
        claimedChatId: input.chatId,
        confirmedAt: null,
        cancelledAt: null,
        ...(occurredAt ? { createdAt: { lte: occurredAt } } : {}),
      },
      data: { cancelledAt: now, revision: { increment: 1 } },
    })
    await tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE "botId"=${input.botId} AND "telegramUserId"=${input.userId} FOR UPDATE`
    const identity = await tx.assistantTelegramIdentity.findFirst({
      where: {
        botId: input.botId,
        telegramUserId: input.userId,
        chatId: input.chatId,
        revokedAt: null,
      },
      select: { id: true },
    })
    if (!identity) return { revoked: false as const }
    const binding = await tx.assistantTelegramBinding.findFirst({
      where: { identityId: identity.id },
      orderBy: { selectionGeneration: "desc" },
      select: { id: true, createdAt: true },
    })
    // Provider dates are rounded to seconds. An event from the second of a
    // newer selection has ambiguous ordering and must be sent again.
    if (binding && occurredAt && binding.createdAt >= occurredAt)
      return { revoked: false as const }
    if (binding && updateId) {
      const next = await tx.assistantTelegramBinding.update({
        where: { id: binding.id },
        data: { inboundSequence: { increment: 1 } },
        select: { inboundSequence: true },
      })
      const key = `${input.botId}_${updateId}`
      await tx.assistantTelegramInbox.create({
        data: {
          bindingId: binding.id,
          botId: input.botId,
          updateId,
          messageId: input.messageId ?? updateId,
          sequence: next.inboundSequence,
          contentDigest: telegramDigest("disconnect", key),
          requestId: `telegram-disconnect_${key}`,
          userMessageId: `telegram-disconnect-user_${key}`,
          providerOccurredAt: occurredAt ?? now,
          expiresAt: new Date(now.getTime() + maxAge),
          state: "COMPLETED",
          completedAt: now,
        },
      })
    }
    await tx.assistantTelegramIdentity.update({
      where: { id: identity.id },
      data: {
        revokedAt: now,
        generation: { increment: 1 },
        selectionGeneration: { increment: 1 },
        activeBindingId: null,
      },
    })
    await tx.assistantTelegramGrant.updateMany({
      where: { identityId: identity.id, revokedAt: null },
      data: { revokedAt: now, generation: { increment: 1 } },
    })
    await cancelTelegramWork(tx, { identityId: identity.id }, now)
    return {
      revoked: true as const,
      connectedMessage: await connectedMessage(tx, {
        botId: input.botId,
        telegramUserId: input.userId,
        chatId: input.chatId,
      }),
    }
  })
}
