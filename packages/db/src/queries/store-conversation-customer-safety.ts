import { z } from "zod"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  MembershipStatus,
  type StoreConversationGuestCredentialPurpose,
} from "../../generated/prisma/enums"
import { loadStoreConversationForAccount } from "./store-conversation-accounts"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  StoreConversationError,
  loadStoreConversationForGuest,
  lockStoreConversation,
  resolveStoreConversationEntry,
} from "./store-conversations-core"

const id = z.string().trim().min(1).max(191)
const operationId = z.string().trim().min(8).max(160)
const reportReason = z.enum([
  "spam",
  "harassment",
  "hateful_content",
  "sexual_content",
  "violence",
  "other",
])

export type StoreConversationSafetyPrincipal =
  | {
      kind: "guest"
      credentialToken: string
      installationToken?: string
      purpose: StoreConversationGuestCredentialPurpose
    }
  | { kind: "account"; accountUserId: string }

type SafetyAccessDependencies = {
  resolveEntry?: typeof resolveStoreConversationEntry
  loadGuest?: typeof loadStoreConversationForGuest
  loadAccount?: typeof loadStoreConversationForAccount
}

async function resolveCustomer(
  db: PrismaClient,
  input: { conversationId: string; publicToken: string },
  principal: StoreConversationSafetyPrincipal,
  dependencies: SafetyAccessDependencies = {},
) {
  const entry = await (
    dependencies.resolveEntry ?? resolveStoreConversationEntry
  )(db, { publicToken: input.publicToken })
  const now = new Date()
  if (principal.kind === "guest") {
    const access = await (
      dependencies.loadGuest ?? loadStoreConversationForGuest
    )(db, {
      conversationId: input.conversationId,
      credentialToken: principal.credentialToken,
      installationToken: principal.installationToken,
      now,
      purpose: principal.purpose,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
      touchCredential: false,
    })
    return {
      conversation: access.conversation,
      principalId: access.credential.guestIdentityId,
      principalKind: "CUSTOMER_GUEST",
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    }
  }
  const access = await (
    dependencies.loadAccount ?? loadStoreConversationForAccount
  )(db, {
    accountUserId: principal.accountUserId,
    conversationId: input.conversationId,
    storeId: entry.storeId,
    tenantId: entry.tenantId,
    touchAccess: false,
  })
  return {
    conversation: access.conversation,
    principalId: principal.accountUserId,
    principalKind: "CUSTOMER_ACCOUNT",
    storeId: entry.storeId,
    tenantId: entry.tenantId,
  }
}

const reportInput = z
  .object({
    clientOperationId: operationId,
    conversationId: id,
    publicToken: id.optional(),
    storeId: id.optional(),
    tenantId: id.optional(),
    messageId: id.optional(),
    reason: reportReason,
    details: z.string().trim().max(500).optional(),
  })
  .strict()

export async function reportCustomerStoreConversation(
  db: PrismaClient,
  raw: {
    clientOperationId: string
    conversationId: string
    publicToken: string
    messageId?: string
    reason: z.infer<typeof reportReason>
    details?: string
  },
  principal: StoreConversationSafetyPrincipal,
  dependencies: SafetyAccessDependencies = {},
) {
  const input = reportInput.parse(raw)
  return runStoreConversationActionTransaction(db, async (tx) => {
    const access = await resolveCustomer(
      tx as PrismaClient,
      { conversationId: input.conversationId, publicToken: raw.publicToken },
      principal,
      dependencies,
    )
    await lockStoreConversation(tx, {
      conversationId: input.conversationId,
      storeId: access.storeId,
      tenantId: access.tenantId,
    })
    if (input.messageId) {
      const message = await tx.storeConversationMessage.findFirst({
        select: { id: true },
        where: { id: input.messageId, conversationId: input.conversationId },
      })
      if (!message)
        throw new StoreConversationError(
          "NOT_FOUND",
          "This message is unavailable.",
        )
    }
    const key = {
      conversationId: input.conversationId,
      principalKind: access.principalKind,
      principalId: access.principalId,
      clientOperationId: input.clientOperationId,
    }
    const previous = await tx.storeConversationCustomerReport.findUnique({
      where: {
        conversationId_principalKind_principalId_clientOperationId: key,
      },
    })
    if (previous) {
      if (
        previous.messageId !== (input.messageId ?? null) ||
        previous.reason !== input.reason ||
        previous.details !== (input.details ?? null)
      )
        throw new StoreConversationError(
          "CONFLICT",
          "This report request was already used with different details.",
        )
      return {
        reportId: previous.id,
        status: "submitted" as const,
        replayed: true,
      }
    }
    const report = await tx.storeConversationCustomerReport.create({
      data: {
        ...key,
        tenantId: access.tenantId,
        storeId: access.storeId,
        messageId: input.messageId ?? null,
        reason: input.reason,
        details: input.details ?? null,
      },
    })
    return {
      reportId: report.id,
      status: "submitted" as const,
      replayed: false,
    }
  })
}

export async function setCustomerStoreConversationBlock(
  db: PrismaClient,
  raw: {
    clientOperationId: string
    conversationId: string
    publicToken: string
    blocked: boolean
  },
  principal: StoreConversationSafetyPrincipal,
  dependencies: SafetyAccessDependencies = {},
) {
  const input = z
    .object({
      clientOperationId: operationId,
      conversationId: id,
      publicToken: id,
      blocked: z.boolean(),
    })
    .strict()
    .parse(raw)
  return runStoreConversationActionTransaction(db, async (tx) => {
    const access = await resolveCustomer(
      tx as PrismaClient,
      input,
      principal,
      dependencies,
    )
    await lockStoreConversation(tx, {
      conversationId: input.conversationId,
      storeId: access.storeId,
      tenantId: access.tenantId,
    })
    const key = {
      conversationId: input.conversationId,
      principalKind: access.principalKind,
      principalId: access.principalId,
      clientOperationId: input.clientOperationId,
    }
    const previous = await tx.storeConversationCustomerBlockCommand.findUnique({
      where: {
        conversationId_principalKind_principalId_clientOperationId: key,
      },
    })
    if (previous) {
      if (previous.blocked !== input.blocked)
        throw new StoreConversationError(
          "CONFLICT",
          "This block request was already used for another action.",
        )
      return {
        blocked: previous.blocked,
        updatedAt: previous.createdAt,
        replayed: true,
      }
    }
    const current = await tx.storeConversation.findFirst({
      select: { customerBlockedAt: true },
      where: {
        id: input.conversationId,
        storeId: access.storeId,
        tenantId: access.tenantId,
      },
    })
    if (!current)
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    const blockedAt = input.blocked
      ? (current.customerBlockedAt ?? new Date())
      : null
    await tx.storeConversation.update({
      data: { customerBlockedAt: blockedAt },
      where: { id: input.conversationId },
    })
    const receipt = await tx.storeConversationCustomerBlockCommand.create({
      data: { ...key, blocked: input.blocked, resultingBlockedAt: blockedAt },
    })
    return {
      blocked: input.blocked,
      updatedAt: receipt.createdAt,
      replayed: false,
    }
  })
}

export async function reportStoreConversationAsOperator(
  db: PrismaClient,
  raw: {
    actorUserId: string
    tenantId: string
    storeId: string
    conversationId: string
    clientOperationId: string
    messageId?: string
    reason: z.infer<typeof reportReason>
    details?: string
  },
) {
  const input = reportInput.parse({
    clientOperationId: raw.clientOperationId,
    conversationId: raw.conversationId,
    storeId: raw.storeId,
    tenantId: raw.tenantId,
    messageId: raw.messageId,
    reason: raw.reason,
    details: raw.details,
  })
  return runStoreConversationActionTransaction(db, async (tx) => {
    const membership = await tx.membership.findFirst({
      select: { id: true },
      where: {
        userId: raw.actorUserId,
        tenantId: raw.tenantId,
        status: MembershipStatus.ACTIVE,
        acceptedAt: { not: null },
      },
    })
    const conversation = await tx.storeConversation.findFirst({
      select: { id: true },
      where: {
        id: input.conversationId,
        tenantId: raw.tenantId,
        storeId: input.storeId,
        store: { status: "ACTIVE" },
      },
    })
    if (!membership || !conversation)
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: raw.storeId,
      tenantId: raw.tenantId,
    })
    if (input.messageId) {
      const message = await tx.storeConversationMessage.findFirst({
        select: { id: true },
        where: { id: input.messageId, conversationId: conversation.id },
      })
      if (!message)
        throw new StoreConversationError(
          "NOT_FOUND",
          "This message is unavailable.",
        )
    }
    const key = {
      conversationId: conversation.id,
      principalKind: "STORE_OPERATOR",
      principalId: membership.id,
      clientOperationId: input.clientOperationId,
    }
    const previous = await tx.storeConversationCustomerReport.findUnique({
      where: {
        conversationId_principalKind_principalId_clientOperationId: key,
      },
    })
    if (previous) {
      if (
        previous.messageId !== (input.messageId ?? null) ||
        previous.reason !== input.reason ||
        previous.details !== (input.details ?? null)
      )
        throw new StoreConversationError(
          "CONFLICT",
          "This report request was already used with different details.",
        )
      return {
        reportId: previous.id,
        status: "submitted" as const,
        replayed: true,
      }
    }
    const report = await tx.storeConversationCustomerReport.create({
      data: {
        ...key,
        tenantId: raw.tenantId,
        storeId: raw.storeId,
        messageId: input.messageId ?? null,
        reason: input.reason,
        details: input.details ?? null,
      },
    })
    return {
      reportId: report.id,
      status: "submitted" as const,
      replayed: false,
    }
  })
}

async function assertPlatformSafetyReviewer(
  db: PrismaClient,
  actorUserId: string,
) {
  const actor = await db.user.findUnique({
    select: { isPlatformAdmin: true },
    where: { id: actorUserId },
  })
  if (!actor?.isPlatformAdmin)
    throw new StoreConversationError(
      "FORBIDDEN",
      "Safety review access is unavailable.",
    )
}

export async function listOpenStoreConversationSafetyReports(
  db: PrismaClient,
  input: {
    actorUserId: string
    status?: "OPEN" | "REVIEWING" | "RESOLVED"
    limit?: number
    cursor?: { createdAt: string; id: string }
  },
) {
  await assertPlatformSafetyReviewer(db, input.actorUserId)
  const limit = z
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(input.limit ?? 50)
  const cursor = input.cursor
    ? z
        .object({
          createdAt: z.string().datetime({ offset: true }),
          id,
        })
        .strict()
        .parse(input.cursor)
    : null
  const status = input.status ?? "OPEN"
  const [rows, matchingCount, pendingCount] = await Promise.all([
    db.storeConversationCustomerReport.findMany({
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        conversationId: true,
        messageId: true,
        principalKind: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        reviewedByUserId: true,
      },
      where: {
        status,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { gt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    }),
    db.storeConversationCustomerReport.count({ where: { status } }),
    db.storeConversationCustomerReport.count({
      where: { status: { in: ["OPEN", "REVIEWING"] } },
    }),
  ])
  const hasMore = rows.length > limit
  const reports = rows.slice(0, limit)
  const last = reports.at(-1)
  return {
    reports,
    matchingCount,
    pendingCount,
    hasMore,
    nextCursor:
      hasMore && last
        ? { createdAt: last.createdAt.toISOString(), id: last.id }
        : null,
  }
}

export async function updateStoreConversationSafetyReportStatus(
  db: PrismaClient,
  input: {
    actorUserId: string
    reportId: string
    status: "REVIEWING" | "RESOLVED"
  },
) {
  return runStoreConversationActionTransaction(db, async (tx) => {
    await assertPlatformSafetyReviewer(tx as PrismaClient, input.actorUserId)
    const report = await tx.storeConversationCustomerReport.findUnique({
      select: { id: true, status: true, resolvedAt: true },
      where: { id: input.reportId },
    })
    if (!report)
      throw new StoreConversationError("NOT_FOUND", "Safety report not found.")
    if (report.status === input.status)
      return {
        id: report.id,
        status: report.status,
        resolvedAt: report.resolvedAt,
      }
    if (
      (report.status === "OPEN" && input.status !== "REVIEWING") ||
      (report.status === "REVIEWING" && input.status !== "RESOLVED") ||
      report.status === "RESOLVED"
    )
      throw new StoreConversationError(
        "CONFLICT",
        "Review this report before resolving it; resolved reports cannot be reopened.",
      )
    const updated = await tx.storeConversationCustomerReport.update({
      data: {
        status: input.status,
        reviewedByUserId: input.actorUserId,
        resolvedAt: input.status === "RESOLVED" ? new Date() : null,
      },
      select: { id: true, status: true, resolvedAt: true },
      where: { id: report.id },
    })
    return updated
  })
}
