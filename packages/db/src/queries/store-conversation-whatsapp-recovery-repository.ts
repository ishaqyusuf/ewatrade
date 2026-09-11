import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CustomerEntryPointStatus,
  StoreConversationWhatsAppRecoveryAttemptStatus,
  StoreConversationWhatsAppRecoveryKind,
  WhatsAppConnectionStatus,
  WhatsAppInboundEventStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import { resolveCurrentWhatsAppBinding } from "./store-conversation-whatsapp-bridge-repository"
import { StoreConversationWhatsAppDiscoveryError } from "./store-conversation-whatsapp-discovery-repository"

const CLAIM_LIFETIME_MS = 60_000
const RETRY_DELAY_MS = 30_000
const MAX_ATTEMPTS = 3

function assertDigest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp recovery is unavailable.",
    )
  }
}

export async function holdStoreConversationWhatsAppAmbiguousRecovery(
  db: PrismaClient,
  input: {
    connectionId: string
    inboundEventId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  return runStoreConversationActionTransaction(db, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "WhatsAppInboundEvent"
      WHERE "id" = ${input.inboundEventId}
      FOR UPDATE
    `)
    const event = await tx.whatsAppInboundEvent.findUnique({
      include: { storeConversationCandidate: { select: { id: true } } },
      where: { id: input.inboundEventId },
    })
    if (
      !event ||
      event.connectionId !== input.connectionId ||
      event.storeId !== input.storeId ||
      event.tenantId !== input.tenantId ||
      event.routeVertical !== "SERVICE" ||
      event.storeConversationCandidate
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "FORBIDDEN",
        "This WhatsApp recovery is unavailable.",
      )
    }
    const replay =
      await tx.storeConversationWhatsAppRecoveryAttempt.findUnique({
        where: { inboundEventId: event.id },
      })
    if (replay) {
      if (
        replay.connectionId !== input.connectionId ||
        replay.storeId !== input.storeId ||
        replay.tenantId !== input.tenantId
      ) {
        throw new StoreConversationWhatsAppDiscoveryError(
          "FORBIDDEN",
          "This WhatsApp recovery is unavailable.",
        )
      }
      return { attemptId: replay.id, replayed: true }
    }
    if (event.status !== WhatsAppInboundEventStatus.RECEIVED) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp message is already being handled.",
      )
    }
    const entry = await tx.customerEntryPoint.findFirst({
      select: { id: true },
      where: {
        status: CustomerEntryPointStatus.PUBLISHED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!entry) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_READY",
        "The current Store recovery link is unavailable.",
      )
    }
    const attempt = await tx.storeConversationWhatsAppRecoveryAttempt.create({
      data: {
        connectionId: input.connectionId,
        inboundEventId: event.id,
        kind: StoreConversationWhatsAppRecoveryKind.AMBIGUOUS_CANDIDATE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const held = await tx.whatsAppInboundEvent.updateMany({
      data: { status: WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE },
      where: { id: event.id, status: WhatsAppInboundEventStatus.RECEIVED },
    })
    if (held.count !== 1) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp message changed while recovery was prepared.",
      )
    }
    return { attemptId: attempt.id, replayed: false }
  })
}

export async function listDueStoreConversationWhatsAppRecoveries(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100)
  const attempts = await db.storeConversationWhatsAppRecoveryAttempt.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, storeId: true, tenantId: true },
    take: limit,
    where: {
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [
        { status: StoreConversationWhatsAppRecoveryAttemptStatus.PENDING },
        {
          nextAttemptAt: { lte: now },
          status: StoreConversationWhatsAppRecoveryAttemptStatus.FAILED,
        },
        {
          claimExpiresAt: { lte: now },
          status: StoreConversationWhatsAppRecoveryAttemptStatus.CLAIMED,
        },
      ],
    },
  })
  return attempts.map(({ id, ...scope }) => ({ attemptId: id, ...scope }))
}

export async function claimStoreConversationWhatsAppRecovery(
  db: PrismaClient,
  input: {
    attemptId: string
    claimToken: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  if (!input.claimToken.trim() || input.claimToken.length > 191) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp recovery is unavailable.",
    )
  }
  return runStoreConversationActionTransaction(db, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppRecoveryAttempt"
      WHERE "id" = ${input.attemptId}
      FOR UPDATE
    `)
    const current = await tx.storeConversationWhatsAppRecoveryAttempt.findFirst(
      {
        include: {
          connection: {
            select: {
              credentialReference: true,
              id: true,
              phoneNumberId: true,
              status: true,
              tenantId: true,
            },
          },
          inboundEvent: {
            select: {
              connectionId: true,
              externalCustomerId: true,
              status: true,
            },
          },
        },
        where: {
          id: input.attemptId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    )
    if (
      !current ||
      current.inboundEvent.status !==
        WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE ||
      current.inboundEvent.connectionId !== current.connectionId ||
      current.connection.status !== WhatsAppConnectionStatus.ACTIVE ||
      current.connection.tenantId !== input.tenantId ||
      current.attemptCount >= MAX_ATTEMPTS ||
      current.status === StoreConversationWhatsAppRecoveryAttemptStatus.SENT ||
      current.status ===
        StoreConversationWhatsAppRecoveryAttemptStatus.OUTCOME_UNKNOWN ||
      current.status ===
        StoreConversationWhatsAppRecoveryAttemptStatus.CANCELLED ||
      (current.nextAttemptAt && current.nextAttemptAt > now) ||
      (current.status ===
        StoreConversationWhatsAppRecoveryAttemptStatus.CLAIMED &&
        (!current.claimExpiresAt || current.claimExpiresAt > now))
    ) {
      return null
    }
    const entry = await tx.customerEntryPoint.findFirst({
      select: { publicToken: true },
      where: {
        status: CustomerEntryPointStatus.PUBLISHED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!entry) return null
    const connection = await resolveCurrentWhatsAppBinding(tx, current)
    if (connection.id !== current.connectionId) return null
    const claimed =
      await tx.storeConversationWhatsAppRecoveryAttempt.updateMany({
        data: {
          attemptCount: { increment: 1 },
          claimedAt: now,
          claimExpiresAt: new Date(now.getTime() + CLAIM_LIFETIME_MS),
          claimToken: input.claimToken,
          failureCode: null,
          nextAttemptAt: null,
          status: StoreConversationWhatsAppRecoveryAttemptStatus.CLAIMED,
        },
        where: {
          id: current.id,
          status: current.status,
          updatedAt: current.updatedAt,
        },
      })
    if (claimed.count !== 1) return null
    return {
      attemptId: current.id,
      claimToken: input.claimToken,
      credentialReference: connection.credentialReference,
      externalCustomerId: current.inboundEvent.externalCustomerId,
      phoneNumberId: connection.phoneNumberId,
      publicToken: entry.publicToken,
    }
  })
}

export async function completeStoreConversationWhatsAppRecovery(
  db: PrismaClient,
  input: {
    attemptId: string
    claimToken: string
    now?: Date
    providerReferenceDigest: string
    storeId: string
    tenantId: string
  },
) {
  assertDigest(input.providerReferenceDigest)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const attempt = await tx.storeConversationWhatsAppRecoveryAttempt.findFirst({
      select: { inboundEventId: true },
      where: {
        claimToken: input.claimToken,
        id: input.attemptId,
        status: StoreConversationWhatsAppRecoveryAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!attempt) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp recovery changed before delivery completed.",
      )
    }
    await tx.storeConversationWhatsAppRecoveryAttempt.update({
      data: {
        claimExpiresAt: null,
        claimToken: null,
        providerReferenceDigest: input.providerReferenceDigest,
        sentAt: now,
        status: StoreConversationWhatsAppRecoveryAttemptStatus.SENT,
      },
      where: { id: input.attemptId },
    })
    const completedEvent = await tx.whatsAppInboundEvent.updateMany({
      data: {
        failureCode: "ambiguous_candidate_recovery_sent",
        processedAt: now,
        status: WhatsAppInboundEventStatus.IGNORED,
      },
      where: {
        id: attempt.inboundEventId,
        status: WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE,
      },
    })
    if (completedEvent.count !== 1) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp recovery changed before delivery completed.",
      )
    }
    return { sent: true as const }
  })
}

export async function failStoreConversationWhatsAppRecovery(
  db: PrismaClient,
  input: {
    attemptId: string
    claimToken: string
    failureCode: string
    now?: Date
    outcomeUnknown: boolean
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  const updated = await db.storeConversationWhatsAppRecoveryAttempt.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      failureCode: input.failureCode.trim().slice(0, 120) || "provider_failed",
      nextAttemptAt: input.outcomeUnknown
        ? null
        : new Date(now.getTime() + RETRY_DELAY_MS),
      status: input.outcomeUnknown
        ? StoreConversationWhatsAppRecoveryAttemptStatus.OUTCOME_UNKNOWN
        : StoreConversationWhatsAppRecoveryAttemptStatus.FAILED,
    },
    where: {
      claimToken: input.claimToken,
      id: input.attemptId,
      status: StoreConversationWhatsAppRecoveryAttemptStatus.CLAIMED,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return updated.count === 1
}
