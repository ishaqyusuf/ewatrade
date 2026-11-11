import { randomUUID } from "node:crypto"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  AssistantTelegramError,
  type TelegramInboxLease,
  type TelegramSender,
  isTelegramId,
  isTelegramUpdateId,
  lockAssistantTelegramConversation,
  lockTelegramSender,
  telegramDigest,
  telegramInboxLeaseWhere,
  telegramPrincipal,
} from "./authority"
import { telegramGrantIdleTime } from "./link"

const inboxLifetime = 15 * 60_000
const inboxLeaseTime = 3 * 60_000
const maxAttempts = 5
const contentSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("message"), text: z.string().min(1).max(4096) })
    .strict(),
  z
    .object({
      kind: z.literal("callback"),
      data: z
        .string()
        .min(1)
        .refine((value) => Buffer.byteLength(value) <= 64),
      callbackId: z.string().min(1).max(128),
    })
    .strict(),
])
export type TelegramInboundContent = z.infer<typeof contentSchema>
export type TelegramUpdateInput = TelegramSender & {
  updateId: string
  messageId: string
  occurredAt: Date
  content: TelegramInboundContent
  allowedUserIds?: ReadonlySet<string>
  allowedTenantIds?: ReadonlySet<string>
}

function ingressDigest(
  sender: TelegramSender,
  messageId: string,
  content: TelegramInboundContent,
) {
  return telegramDigest("ingress", {
    userId: sender.userId,
    chatId: sender.chatId,
    messageId,
    content,
  })
}

export function acceptAssistantTelegramUpdate(
  db: PrismaClient,
  input: TelegramUpdateInput,
  now = new Date(),
) {
  const content = contentSchema.safeParse(input.content)
  if (
    !content.success ||
    !isTelegramId(input.botId) ||
    !isTelegramId(input.userId) ||
    !isTelegramId(input.chatId) ||
    !isTelegramId(input.messageId) ||
    !isTelegramUpdateId(input.updateId) ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    input.occurredAt.getTime() > now.getTime() + 30_000 ||
    input.occurredAt.getTime() <= now.getTime() - inboxLifetime
  )
    return Promise.resolve(null)
  const contentDigest = ingressDigest(input, input.messageId, content.data)
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockTelegramSender(tx, input)
    const identity = await tx.assistantTelegramIdentity.findFirst({
      where: {
        botId: input.botId,
        telegramUserId: input.userId,
        chatId: input.chatId,
        revokedAt: null,
      },
    })
    if (!identity?.activeBindingId) return null
    const binding = await tx.assistantTelegramBinding.findFirst({
      where: { id: identity.activeBindingId, identityId: identity.id },
      include: { identity: true, grant: true },
    })
    if (
      !binding ||
      input.occurredAt.getTime() <
        Math.floor(binding.createdAt.getTime() / 1000) * 1000 ||
      (input.allowedUserIds && !input.allowedUserIds.has(identity.userId)) ||
      (input.allowedTenantIds &&
        !input.allowedTenantIds.has(binding.grant.tenantId))
    )
      return null
    try {
      await lockAssistantTelegramConversation(
        tx,
        telegramPrincipal(binding),
        undefined,
        now,
      )
    } catch (error) {
      if (error instanceof AssistantTelegramError) return null
      throw error
    }
    const duplicate = await tx.assistantTelegramInbox.findUnique({
      where: {
        botId_updateId: { botId: input.botId, updateId: input.updateId },
      },
      select: { id: true, contentDigest: true, bindingId: true, state: true },
    })
    if (duplicate)
      return duplicate.contentDigest === contentDigest &&
        duplicate.bindingId === binding.id &&
        duplicate.state === "PENDING"
        ? { id: duplicate.id }
        : null
    const next = await tx.assistantTelegramBinding.update({
      where: { id: binding.id },
      data: { inboundSequence: { increment: 1 } },
      select: { inboundSequence: true },
    })
    // Renew idleness in batches while retaining the absolute grant deadline.
    if (
      binding.grant.idleExpiresAt.getTime() - now.getTime() <
      telegramGrantIdleTime - 60 * 60_000
    ) {
      await tx.assistantTelegramGrant.update({
        where: { id: binding.grantId },
        data: {
          idleExpiresAt: new Date(
            Math.min(
              binding.grant.expiresAt.getTime(),
              now.getTime() + telegramGrantIdleTime,
            ),
          ),
        },
      })
    }
    return tx.assistantTelegramInbox.create({
      data: {
        botId: input.botId,
        updateId: input.updateId,
        bindingId: binding.id,
        messageId: input.messageId,
        content: content.data,
        contentDigest,
        sequence: next.inboundSequence,
        requestId: `telegram-turn_${randomUUID()}`,
        userMessageId: `telegram-user_${randomUUID()}`,
        providerOccurredAt: input.occurredAt,
        expiresAt: new Date(
          Math.min(
            now.getTime() + inboxLifetime,
            binding.grant.expiresAt.getTime(),
          ),
        ),
        createdAt: now,
      },
      select: { id: true },
    })
  })
}

export function claimAssistantTelegramInbox(
  db: PrismaClient,
  id: string,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const inbox = await tx.assistantTelegramInbox.findUnique({
      where: { id },
      include: { binding: { include: { identity: true } } },
    })
    if (
      !inbox ||
      inbox.expiresAt <= now ||
      (inbox.nextAttemptAt && inbox.nextAttemptAt > now)
    )
      return null
    const reclaim =
      inbox.state === "PROCESSING" &&
      inbox.leaseExpiresAt &&
      inbox.leaseExpiresAt <= now
    if (inbox.state !== "PENDING" && !reclaim) return null
    const principal = telegramPrincipal(inbox.binding)
    await lockTelegramSender(tx, principal)
    const earlier = await tx.assistantTelegramInbox.findFirst({
      where: {
        bindingId: inbox.bindingId,
        sequence: { lt: inbox.sequence },
        expiresAt: { gt: now },
        state: { in: ["PENDING", "PROCESSING"] },
      },
      select: { id: true },
    })
    if (earlier) return null
    const where = {
      id,
      state: inbox.state,
      leaseGeneration: inbox.leaseGeneration,
    }
    const content = contentSchema.safeParse(inbox.content)
    try {
      await lockAssistantTelegramConversation(tx, principal, undefined, now)
    } catch (error) {
      if (!(error instanceof AssistantTelegramError)) throw error
      await tx.assistantTelegramInbox.updateMany({
        where,
        data: {
          state: "CANCELLED",
          errorCode: "SCOPE_CHANGED",
          content: Prisma.DbNull,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      })
      return null
    }
    const validContent =
      content.success &&
      ingressDigest(principal, inbox.messageId, content.data) ===
        inbox.contentDigest
    if (!validContent || inbox.attempts >= maxAttempts) {
      await tx.assistantTelegramInbox.updateMany({
        where,
        data: {
          state: "FAILED",
          errorCode: validContent ? "ATTEMPTS_EXHAUSTED" : "INVALID_CONTENT",
          content: Prisma.DbNull,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      })
      return null
    }
    const owner = randomUUID()
    const generation = inbox.leaseGeneration + 1
    const changed = await tx.assistantTelegramInbox.updateMany({
      where,
      data: {
        state: "PROCESSING",
        leaseOwner: owner,
        leaseGeneration: generation,
        leaseExpiresAt: new Date(now.getTime() + inboxLeaseTime),
        attempts: { increment: 1 },
        nextAttemptAt: null,
      },
    })
    return changed.count === 1
      ? {
          inbox,
          principal,
          content: content.data,
          lease: { inboxId: id, bindingId: inbox.bindingId, owner, generation },
        }
      : null
  })
}

export async function settleAssistantTelegramInbox(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  result: {
    state?: "COMPLETED" | "FAILED" | "CANCELLED"
    runId?: string
    errorCode?: string
  } = {},
  now = new Date(),
) {
  const changed = await tx.assistantTelegramInbox.updateMany({
    where: telegramInboxLeaseWhere(lease, now),
    data: {
      state: result.state ?? "COMPLETED",
      runId: result.runId,
      errorCode: result.errorCode ?? null,
      content: Prisma.DbNull,
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: now,
    },
  })
  if (changed.count !== 1 && result.state === "CANCELLED") return
  if (changed.count !== 1) throw new AssistantTelegramError("CONFLICT")
}

export async function retryAssistantTelegramInbox(
  db: DbClient,
  lease: TelegramInboxLease,
  errorCode: string,
  now = new Date(),
) {
  await db.assistantTelegramInbox.updateMany({
    where: telegramInboxLeaseWhere(lease, now),
    data: {
      state: "PENDING",
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode,
      nextAttemptAt: new Date(now.getTime() + 30_000),
    },
  })
}

export async function nextAssistantTelegramInbox(
  db: DbClient,
  inboxId: string,
  now = new Date(),
) {
  const row = await db.assistantTelegramInbox.findUnique({
    where: { id: inboxId },
    select: { bindingId: true },
  })
  if (!row) return null
  const next = await db.assistantTelegramInbox.findFirst({
    where: {
      bindingId: row.bindingId,
      state: { in: ["PENDING", "PROCESSING"] },
      expiresAt: { gt: now },
    },
    orderBy: { sequence: "asc" },
    select: { id: true, state: true, nextAttemptAt: true },
  })
  return next &&
    next.id !== inboxId &&
    next.state === "PENDING" &&
    (!next.nextAttemptAt || next.nextAttemptAt <= now)
    ? { id: next.id }
    : null
}

export function listAssistantTelegramInboxRecovery(
  db: DbClient,
  now = new Date(),
) {
  return db.assistantTelegramInbox.findMany({
    where: {
      expiresAt: { gt: now },
      OR: [
        {
          state: "PENDING",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        { state: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true },
  })
}
