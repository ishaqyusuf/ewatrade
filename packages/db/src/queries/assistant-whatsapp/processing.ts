import { randomUUID } from "node:crypto"
import {
  WHATSAPP_TURN_LEASE_MS,
  WHATSAPP_TURN_MAX_ATTEMPTS,
  WHATSAPP_TURN_RETRY_MS,
} from "@ewatrade/assistant/channels/worker"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"

export type WhatsAppInboxLease = {
  inboxId: string
  bindingId: string
  owner: string
  generation: number
}
import { assistantWhatsAppAuthorityDigest } from "./execution"
import { cancelAssistantWhatsAppPendingMediaInTransaction } from "./media-source-lifecycle"
import {
  type AssistantWhatsAppStagedReview,
  type AssistantWhatsAppStagedWorkflowReview,
  stageAssistantWhatsAppOutboxInTransaction,
} from "./outbox"
import { resolveAssistantWhatsAppWorkflowActionReceiptScope } from "./workflow-terminal"

const terminal = ["COMPLETED", "CANCELLED", "FAILED", "EXPIRED"]
const include = {
  binding: {
    include: {
      identity: {
        select: { userId: true, phoneNumberId: true, senderId: true },
      },
    },
  },
} as const
function proof(row: {
  binding: {
    id: string
    grantId: string
    identityGeneration: number
    grantGeneration: number
    selectionGeneration: number
    identity: { phoneNumberId: string; senderId: string }
  } | null
}): WhatsAppConversationPrincipal {
  if (!row.binding) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return {
    kind: "linked_whatsapp",
    phoneNumberId: row.binding.identity.phoneNumberId,
    senderId: row.binding.identity.senderId,
    bindingId: row.binding.id,
    grantId: row.binding.grantId,
    identityGeneration: row.binding.identityGeneration,
    grantGeneration: row.binding.grantGeneration,
    selectionGeneration: row.binding.selectionGeneration,
  }
}
async function lockIdentity(db: DbClient, inboxId: string) {
  await db.$queryRaw`SELECT i.id FROM "AssistantWhatsAppIdentity" i JOIN "AssistantWhatsAppBinding" b ON b."identityId"=i.id JOIN "AssistantWhatsAppInbox" q ON q."bindingId"=b.id WHERE q.id=${inboxId} FOR UPDATE OF i`
}
export async function assertAssistantWhatsAppInboxLease(
  db: DbClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  const row = await db.assistantWhatsAppInbox.findFirst({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
  })
  if (
    !row ||
    !row.bindingId ||
    !["TURN", "ACTION"].includes(row.kind) ||
    row.identityId
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  return row
}

/** Identity lock serializes claims; FIFO prevents later messages overtaking a live or delayed turn. */
export function claimAssistantWhatsAppInbox(
  db: PrismaClient,
  inboxId: string,
  permittedUserIds: readonly string[],
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockIdentity(tx, inboxId)
    const row = await tx.assistantWhatsAppInbox.findUnique({
      where: { id: inboxId },
      include,
    })
    if (
      !row ||
      !["TURN", "ACTION"].includes(row.kind) ||
      !row.binding ||
      row.identityId ||
      terminal.includes(row.state)
    )
      return { kind: "idle" as const, bindingId: row?.bindingId }
    if (row.expiresAt <= now) {
      await cancelAssistantWhatsAppPendingMediaInTransaction(tx, [row.id], now)
      await tx.assistantWhatsAppInbox.update({
        where: { id: row.id },
        data: {
          state: "EXPIRED",
          content: Prisma.DbNull,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      })
      return { kind: "expired" as const, bindingId: row.bindingId }
    }
    const principal = proof(row)
    try {
      if (!permittedUserIds.includes(row.binding.identity.userId))
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      try {
        await resolveAssistantWhatsAppConversation(tx, principal, now)
      } catch (error) {
        if (!(error instanceof AssistantWhatsAppError) || row.kind !== "ACTION")
          throw error
        await resolveAssistantWhatsAppWorkflowActionReceiptScope(
          tx,
          principal,
          row.content,
          now,
        )
      }
    } catch (error) {
      if (!(error instanceof AssistantWhatsAppError)) throw error
      await cancelAssistantWhatsAppPendingMediaInTransaction(tx, [row.id], now)
      await tx.assistantWhatsAppInbox.update({
        where: { id: row.id },
        data: {
          state: "CANCELLED",
          errorCode: "AUTHORITY_CHANGED",
          content: Prisma.DbNull,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      })
      return { kind: "cancelled" as const, bindingId: row.bindingId }
    }
    const first = await tx.assistantWhatsAppInbox.findFirst({
      where: {
        bindingId: row.bindingId,
        kind: { in: ["TURN", "ACTION"] },
        identityId: null,
        state: { in: ["PENDING", "PROCESSING"] },
      },
      orderBy: { sequence: "asc" },
      select: { id: true },
    })
    if (
      first?.id !== row.id ||
      (row.state === "PROCESSING" &&
        row.leaseExpiresAt &&
        row.leaseExpiresAt > now) ||
      (row.nextAttemptAt && row.nextAttemptAt > now)
    )
      return { kind: "busy" as const, bindingId: row.bindingId }
    const recoverable =
      row.kind === "TURN" && row.attempts >= WHATSAPP_TURN_MAX_ATTEMPTS
        ? await tx.assistantRun.findFirst({
            where: {
              actorUserId: row.binding.identity.userId,
              requestId: row.requestId,
              conversationId: row.binding.conversationId,
            },
            select: { id: true },
          })
        : null
    if (row.attempts >= WHATSAPP_TURN_MAX_ATTEMPTS && !recoverable) {
      await tx.assistantWhatsAppInbox.update({
        where: { id: row.id },
        data: {
          state: "FAILED",
          errorCode: "ATTEMPTS_EXHAUSTED",
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      })
      return { kind: "failed" as const, bindingId: row.bindingId }
    }
    const owner = randomUUID()
    const claimed = await tx.assistantWhatsAppInbox.update({
      where: { id: row.id },
      data: {
        state: "PROCESSING",
        attempts: { increment: 1 },
        leaseGeneration: { increment: 1 },
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + WHATSAPP_TURN_LEASE_MS),
        nextAttemptAt: null,
        errorCode: null,
      },
    })
    return {
      kind: "claimed" as const,
      inbox: claimed,
      principal,
      conversationId: row.binding.conversationId,
      purpose: row.binding.purpose,
      lease: {
        inboxId: claimed.id,
        bindingId: row.binding.id,
        owner,
        generation: claimed.leaseGeneration,
      },
    }
  })
}

/** Durable request lookup recovers a committed run; it never restarts model/tool execution. */
export async function recoverAssistantWhatsAppInboxRun(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  const row = await assertAssistantWhatsAppInboxLease(db, lease, now)
  if (row.kind !== "TURN") return null
  const binding = await db.assistantWhatsAppBinding.findUniqueOrThrow({
    where: { id: lease.bindingId },
    include: { identity: { select: { userId: true } } },
  })
  const where = {
    actorUserId: binding.identity.userId,
    requestId: row.requestId,
    conversationId: binding.conversationId,
  }
  await db.assistantRun.updateMany({
    where: {
      ...where,
      status: "RUNNING",
      startedAt: { lt: new Date(now.getTime() - 90_000) },
    },
    data: { status: "FAILED", errorCode: "TURN_INTERRUPTED", completedAt: now },
  })
  return db.assistantRun.findFirst({
    where,
    select: {
      id: true,
      status: true,
      errorCode: true,
      assistantMessageId: true,
      assistantMessage: {
        select: { id: true, role: true, conversationId: true },
      },
    },
  })
}

export function settleAssistantWhatsAppInbox(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  options: {
    permittedUserIds: readonly string[]
    errorCode?: string
    review?: AssistantWhatsAppStagedReview
    workflowReview?: AssistantWhatsAppStagedWorkflowReview
  },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockIdentity(tx, lease.inboxId)
    const current = await tx.assistantWhatsAppInbox.findFirst({
      where: {
        id: lease.inboxId,
        bindingId: lease.bindingId,
        state: "PROCESSING",
        leaseOwner: lease.owner,
        leaseGeneration: lease.generation,
        leaseExpiresAt: { gt: now },
        expiresAt: { gt: now },
      },
      include,
    })
    if (
      !current ||
      current.kind !== "TURN" ||
      !current.binding ||
      current.identityId
    )
      return null
    let authorized = options.permittedUserIds.includes(
      current.binding.identity.userId,
    )
    let scopeLabel = ""
    let navigationScope: { tenantId: string; storeId: string } | undefined
    try {
      const resolved = await resolveAssistantWhatsAppConversation(
        tx,
        proof(current),
        now,
      )
      scopeLabel = `${resolved.tenantContext.tenant.name} · ${resolved.tenantContext.activeStore?.name ?? "Store"}`
      const activeStore = resolved.tenantContext.activeStore
      if (activeStore)
        navigationScope = {
          tenantId: resolved.tenantContext.tenant.id,
          storeId: activeStore.id,
        }
      if (
        current.executionAuthorityDigest &&
        current.executionAuthorityDigest !==
          (await assistantWhatsAppAuthorityDigest(tx, resolved))
      )
        authorized = false
    } catch (error) {
      if (!(error instanceof AssistantWhatsAppError)) throw error
      authorized = false
    }
    const run = await tx.assistantRun.findFirst({
      where: {
        actorUserId: current.binding.identity.userId,
        requestId: current.requestId,
        conversationId: current.binding.conversationId,
      },
      include: {
        assistantMessage: {
          select: { conversationId: true, role: true, parts: true },
        },
      },
    })
    if (authorized && run?.status === "RUNNING") return null
    if (run?.status === "COMPLETED" && !current.executionAuthorityDigest)
      authorized = false
    const completed =
      authorized &&
      run?.status === "COMPLETED" &&
      run.assistantMessageId &&
      run.assistantMessage?.conversationId === current.binding.conversationId &&
      run.assistantMessage.role === "assistant"
    const state = !authorized ? "CANCELLED" : completed ? "COMPLETED" : "FAILED"
    if (completed && run && current.executionAuthorityDigest)
      await stageAssistantWhatsAppOutboxInTransaction(
        tx,
        current,
        run,
        current.executionAuthorityDigest,
        scopeLabel,
        navigationScope,
        current.binding.conversationId,
        options.review,
        proof(current),
        current.binding.purpose === "SETUP" ||
          current.binding.purpose === "PRODUCT_CREATE"
          ? {
              purpose: current.binding.purpose,
              actorUserId: current.binding.identity.userId,
              review: options.workflowReview,
            }
          : undefined,
      )
    if (!authorized)
      await cancelAssistantWhatsAppPendingMediaInTransaction(
        tx,
        [current.id],
        now,
      )
    await tx.assistantWhatsAppInbox.update({
      where: { id: current.id },
      data: {
        state,
        content: !authorized ? Prisma.DbNull : undefined,
        runId: run?.id,
        errorCode: !authorized
          ? "AUTHORITY_CHANGED"
          : completed
            ? null
            : (options.errorCode ?? run?.errorCode ?? "TURN_FAILED"),
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    })
    return { state }
  })
}

export async function retryAssistantWhatsAppInbox(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  return db.assistantWhatsAppInbox.updateMany({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      kind: { in: ["TURN", "ACTION"] },
      identityId: null,
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
    data: {
      state: "PENDING",
      nextAttemptAt: new Date(now.getTime() + WHATSAPP_TURN_RETRY_MS),
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: "RETRY_PENDING",
    },
  })
}

export function nextAssistantWhatsAppInbox(
  db: DbClient,
  bindingId: string,
  now = new Date(),
) {
  return db.assistantWhatsAppInbox.findFirst({
    where: {
      bindingId,
      kind: { in: ["TURN", "ACTION"] },
      identityId: null,
      state: "PENDING",
      expiresAt: { gt: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { sequence: "asc" },
    select: { id: true },
  })
}
export async function listAssistantWhatsAppInboxRecovery(
  db: DbClient,
  now = new Date(),
) {
  const turns = await db.assistantWhatsAppInbox.findMany({
    where: {
      kind: { in: ["TURN", "ACTION"] },
      bindingId: { not: null },
      identityId: null,
      OR: [
        {
          state: "PENDING",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        { state: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { receivedAt: "asc" },
    distinct: ["bindingId"],
    take: 25,
    select: { id: true },
  })
  const controls = await db.assistantWhatsAppInbox.findMany({
    where: { kind: "CONTROL", state: "PENDING" },
    orderBy: { receivedAt: "asc" },
    distinct: ["identityId"],
    take: 25,
    select: { id: true },
  })
  return [...turns, ...controls]
}
/** Clear expired private queue bytes even while rollout is disabled; attribution remains. */
export function expireAssistantWhatsAppInbox(
  db: PrismaClient,
  now = new Date(),
  inboxIds?: readonly string[],
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const rows = await tx.assistantWhatsAppInbox.findMany({
      where: {
        id: inboxIds ? { in: [...inboxIds] } : undefined,
        expiresAt: { lte: now },
        OR: [
          { content: { not: Prisma.DbNull } },
          { state: { in: ["PENDING", "PROCESSING"] } },
        ],
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
      select: { id: true, state: true },
    })
    await cancelAssistantWhatsAppPendingMediaInTransaction(
      tx,
      rows.map((row) => row.id),
      now,
    )
    for (const row of rows)
      await tx.assistantWhatsAppInbox.update({
        where: { id: row.id },
        data: {
          content: Prisma.DbNull,
          ...(["PENDING", "PROCESSING"].includes(row.state)
            ? {
                state: "EXPIRED" as const,
                completedAt: now,
                leaseOwner: null,
                leaseExpiresAt: null,
              }
            : {}),
        },
      })
    return { cleared: rows.length }
  })
}
