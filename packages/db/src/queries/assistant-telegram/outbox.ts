import { randomUUID } from "node:crypto"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  AssistantTelegramError,
  type TelegramInboxLease,
  assistantTelegramAuthorityDigest,
  isTelegramId,
  lockAssistantTelegramConversation,
  lockTelegramSender,
  resolveAssistantTelegramConversation,
  telegramDigest,
  telegramInboxLeaseWhere,
  telegramPrincipal,
} from "./authority"

const maxAttempts = 5
const outboxLeaseTime = 45_000
const buttonsSchema = z
  .array(
    z
      .array(
        z.union([
          z
            .object({
              text: z.string().min(1).max(64),
              data: z
                .string()
                .min(1)
                .refine((value) => Buffer.byteLength(value) <= 64),
            })
            .strict(),
          z
            .object({
              text: z.string().min(1).max(64),
              url: z.url({ protocol: /^https$/ }).max(2048),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(5),
  )
  .max(20)
  .optional()
/** Telegram HTML; the renderer escapes all user, model and business text. */
const htmlSchema = z.literal(true).optional()
const messagePayloadSchema = z
  .object({
    text: z.string().min(1).max(4096),
    html: htmlSchema,
    buttons: buttonsSchema,
    /** Quote the bot's earlier message, e.g. a receipt under its review. */
    replyToMessageId: z.string().refine(isTelegramId).optional(),
  })
  .strict()
const payloadSchema = z.union([
  messagePayloadSchema,
  z
    .object({ clearKeyboardMessageId: z.string().refine(isTelegramId) })
    .strict(),
  // A decided review edited in place: its proven facts plus one status line.
  z
    .object({
      editMessageId: z.string().refine(isTelegramId),
      text: z.string().min(1).max(4096),
      html: htmlSchema,
      /** Kept buttons, e.g. URL buttons after a choice; absent removes the keyboard. */
      buttons: buttonsSchema,
    })
    .strict(),
])
export type TelegramOutboxPayload = z.infer<typeof payloadSchema>
export type TelegramOutboxLease = {
  outboxId: string
  owner: string
  generation: number
}

function outboxLeaseWhere(lease: TelegramOutboxLease) {
  return {
    id: lease.outboxId,
    state: "SENDING" as const,
    leaseOwner: lease.owner,
    leaseGeneration: lease.generation,
  }
}

export async function stageAssistantTelegramOutbox(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  input: TelegramOutboxPayload & {
    runId?: string
    messageId?: string
    expiresAt?: Date
  },
  now = new Date(),
) {
  const { runId, messageId, expiresAt, ...reply } = input
  const payload = payloadSchema.parse(reply)
  const inbox = await tx.assistantTelegramInbox.findFirst({
    where: telegramInboxLeaseWhere(lease, now),
    include: {
      binding: { include: { identity: true } },
      outbox: {
        orderBy: { sequence: "desc" },
        take: 1,
        select: { sequence: true },
      },
    },
  })
  if (!inbox) throw new AssistantTelegramError("CONFLICT")
  const resolved = await lockAssistantTelegramConversation(
    tx,
    telegramPrincipal(inbox.binding),
    lease,
    now,
  )
  return tx.assistantTelegramOutbox.create({
    data: {
      inboxId: inbox.id,
      sequence: (inbox.outbox[0]?.sequence ?? 0) + 1,
      payload,
      payloadDigest: telegramDigest("outbox", payload),
      authorityDigest:
        inbox.executionAuthorityDigest ??
        (await assistantTelegramAuthorityDigest(tx, resolved)),
      runId,
      messageId,
      expiresAt:
        expiresAt && expiresAt < inbox.expiresAt ? expiresAt : inbox.expiresAt,
    },
    select: { id: true },
  })
}

const outboxRelations = {
  inbox: { include: { binding: { include: { identity: true } } } },
} as const

export function claimAssistantTelegramOutbox(
  db: PrismaClient,
  id: string,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const outbox = await tx.assistantTelegramOutbox.findUnique({
      where: { id },
      include: outboxRelations,
    })
    if (
      !outbox ||
      outbox.state !== "PENDING" ||
      outbox.expiresAt <= now ||
      (outbox.nextAttemptAt && outbox.nextAttemptAt > now)
    )
      return null
    const principal = telegramPrincipal(outbox.inbox.binding)
    await lockTelegramSender(tx, principal)
    const earlier = await tx.assistantTelegramOutbox.findFirst({
      where: {
        inbox: { bindingId: outbox.inbox.bindingId },
        state: { in: ["PENDING", "SENDING"] },
        expiresAt: { gt: now },
        OR: [
          { inbox: { sequence: { lt: outbox.inbox.sequence } } },
          { inboxId: outbox.inboxId, sequence: { lt: outbox.sequence } },
        ],
      },
      select: { id: true },
    })
    if (earlier) return null
    const where = {
      id,
      state: "PENDING" as const,
      leaseGeneration: outbox.leaseGeneration,
    }
    const payload = payloadSchema.safeParse(outbox.payload)
    if (
      !payload.success ||
      telegramDigest("outbox", payload.data) !== outbox.payloadDigest ||
      outbox.attempts >= maxAttempts
    ) {
      await tx.assistantTelegramOutbox.updateMany({
        where,
        data: {
          state: "FAILED",
          errorCode:
            outbox.attempts >= maxAttempts
              ? "ATTEMPTS_EXHAUSTED"
              : "INVALID_PAYLOAD",
          payload: Prisma.DbNull,
          completedAt: now,
        },
      })
      return null
    }
    try {
      const resolved = await lockAssistantTelegramConversation(
        tx,
        principal,
        undefined,
        now,
      )
      if (
        outbox.authorityDigest !==
        (await assistantTelegramAuthorityDigest(tx, resolved))
      )
        throw new AssistantTelegramError("UNAUTHORIZED")
    } catch (error) {
      if (!(error instanceof AssistantTelegramError)) throw error
      await tx.assistantTelegramOutbox.updateMany({
        where,
        data: {
          state: "CANCELLED",
          errorCode: "SCOPE_CHANGED",
          payload: Prisma.DbNull,
          completedAt: now,
        },
      })
      return null
    }
    const owner = randomUUID()
    const generation = outbox.leaseGeneration + 1
    const changed = await tx.assistantTelegramOutbox.updateMany({
      where,
      data: {
        state: "SENDING",
        leaseOwner: owner,
        leaseGeneration: generation,
        leaseExpiresAt: new Date(now.getTime() + outboxLeaseTime),
        attempts: { increment: 1 },
        nextAttemptAt: null,
      },
    })
    return changed.count === 1
      ? {
          outbox,
          principal,
          payload: payload.data,
          lease: { outboxId: id, owner, generation },
        }
      : null
  })
}

export async function assertAssistantTelegramDeliveryAuthority(
  db: DbClient,
  lease: TelegramOutboxLease,
  now = new Date(),
) {
  const row = await db.assistantTelegramOutbox.findFirst({
    where: {
      ...outboxLeaseWhere(lease),
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
    include: outboxRelations,
  })
  if (!row) throw new AssistantTelegramError("UNAUTHORIZED")
  const resolved = await resolveAssistantTelegramConversation(
    db,
    telegramPrincipal(row.inbox.binding),
    undefined,
    now,
  )
  if (
    row.authorityDigest !==
    (await assistantTelegramAuthorityDigest(db, resolved))
  )
    throw new AssistantTelegramError("UNAUTHORIZED")
  return resolved
}

type DeliveryResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "retry"; retryAt: Date; errorCode?: string }
  | { status: "failed" | "unknown" | "cancelled"; errorCode?: string }

export async function settleAssistantTelegramOutbox(
  db: DbClient,
  lease: TelegramOutboxLease,
  result: DeliveryResult,
  now = new Date(),
) {
  if (result.status === "sent" && !isTelegramId(result.providerMessageId))
    throw new AssistantTelegramError("UNAVAILABLE")
  const where = outboxLeaseWhere(lease)
  const updated = await db.assistantTelegramOutbox.updateMany({
    where,
    data:
      result.status === "retry"
        ? {
            state: "PENDING",
            nextAttemptAt: result.retryAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            errorCode: result.errorCode ?? "RATE_LIMITED",
          }
        : {
            state:
              result.status === "sent"
                ? "SENT"
                : result.status === "unknown"
                  ? "UNKNOWN"
                  : result.status === "cancelled"
                    ? "CANCELLED"
                    : "FAILED",
            payload: Prisma.DbNull,
            providerMessageId:
              result.status === "sent" ? result.providerMessageId : undefined,
            errorCode:
              result.status === "sent" ? null : (result.errorCode ?? null),
            leaseOwner: null,
            leaseExpiresAt: null,
            completedAt: now,
          },
  })
  return updated.count === 1
}

export async function nextAssistantTelegramOutbox(
  db: DbClient,
  outboxId: string,
  now = new Date(),
) {
  const row = await db.assistantTelegramOutbox.findUnique({
    where: { id: outboxId },
    select: { inbox: { select: { bindingId: true } } },
  })
  if (!row) return null
  return db.assistantTelegramOutbox.findFirst({
    where: {
      inbox: { bindingId: row.inbox.bindingId },
      state: "PENDING",
      expiresAt: { gt: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ inbox: { sequence: "asc" } }, { sequence: "asc" }],
    select: { id: true },
  })
}

export function listAssistantTelegramOutboxRecovery(
  db: DbClient,
  now = new Date(),
) {
  return db.assistantTelegramOutbox.findMany({
    where: {
      state: "PENDING",
      expiresAt: { gt: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true },
  })
}
