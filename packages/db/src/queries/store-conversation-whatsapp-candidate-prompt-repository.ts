import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationWhatsAppCandidateAction,
  StoreConversationWhatsAppCandidateActionCapabilityStatus,
  StoreConversationWhatsAppCandidateAttemptStatus,
  StoreConversationWhatsAppCandidateStatus,
  WhatsAppConnectionStatus,
  WhatsAppInboundEventStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import { resolveCurrentWhatsAppBinding } from "./store-conversation-whatsapp-bridge-repository"
import {
  StoreConversationWhatsAppDiscoveryError,
  assertStoreConversationWhatsAppCandidateEvidenceCurrent,
  loadSingleActiveStoreConversationWhatsAppSource,
} from "./store-conversation-whatsapp-discovery-repository"

const CLAIM_LIFETIME_MS = 60_000
const RETRY_DELAY_MS = 30_000
const MAX_ATTEMPTS = 3

const projectedActions = {
  [StoreConversationWhatsAppCandidateAction.CONTINUE]: "continue",
  [StoreConversationWhatsAppCandidateAction.START_NEW]: "start_new",
  [StoreConversationWhatsAppCandidateAction.NOT_MINE]: "not_mine",
} as const

function normalizeRecipient(value: string) {
  const digits = value.trim().replace(/^\+/, "")
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp prompt is unavailable.",
    )
  }
  return `+${digits}`
}

function assertDigest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp prompt is unavailable.",
    )
  }
}

export async function listDueStoreConversationWhatsAppCandidatePrompts(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100)
  return db.storeConversationWhatsAppCandidateAttempt.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { candidateId: true, storeId: true, tenantId: true },
    take: limit,
    where: {
      attemptCount: { lt: MAX_ATTEMPTS },
      candidate: {
        expiresAt: { gt: now },
        status: StoreConversationWhatsAppCandidateStatus.PENDING,
      },
      OR: [
        { status: StoreConversationWhatsAppCandidateAttemptStatus.PENDING },
        {
          nextAttemptAt: { lte: now },
          status: StoreConversationWhatsAppCandidateAttemptStatus.FAILED,
        },
        {
          claimExpiresAt: { lte: now },
          status: StoreConversationWhatsAppCandidateAttemptStatus.CLAIMED,
        },
      ],
    },
  })
}

export async function claimStoreConversationWhatsAppCandidatePrompt(
  db: PrismaClient,
  input: {
    candidateId: string
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
      "This WhatsApp prompt is unavailable.",
    )
  }
  return runStoreConversationActionTransaction(db, async (tx) => {
    const attempt =
      await tx.storeConversationWhatsAppCandidateAttempt.findFirst({
        include: {
          candidate: {
            include: {
              actionCapabilities: {
                orderBy: { action: "asc" },
                select: { action: true, expiresAt: true, status: true },
              },
              conversation: { select: { guestIdentityId: true } },
              inboundEvent: {
                select: { externalCustomerId: true, status: true },
              },
            },
          },
          connection: {
            select: {
              credentialReference: true,
              phoneNumberId: true,
              status: true,
              tenantId: true,
            },
          },
        },
        where: {
          candidateId: input.candidateId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    if (!attempt) return null
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppCandidateAttempt"
      WHERE "id" = ${attempt.id}
      FOR UPDATE
    `)
    const current =
      await tx.storeConversationWhatsAppCandidateAttempt.findUnique({
        include: {
          candidate: {
            include: {
              actionCapabilities: {
                orderBy: { action: "asc" },
                select: { action: true, expiresAt: true, status: true },
              },
              conversation: { select: { guestIdentityId: true } },
              inboundEvent: {
                select: { externalCustomerId: true, status: true },
              },
            },
          },
          connection: {
            select: {
              credentialReference: true,
              phoneNumberId: true,
              status: true,
              tenantId: true,
            },
          },
        },
        where: { id: attempt.id },
      })
    if (
      !current ||
      current.candidate.status !==
        StoreConversationWhatsAppCandidateStatus.PENDING ||
      current.candidate.expiresAt <= now ||
      current.candidate.inboundEvent.status !==
        WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE ||
      current.candidate.revision !== current.candidateRevision ||
      current.connection.status !== WhatsAppConnectionStatus.ACTIVE ||
      current.connection.tenantId !== current.tenantId ||
      current.attemptCount >= MAX_ATTEMPTS ||
      (current.nextAttemptAt && current.nextAttemptAt > now) ||
      current.status === StoreConversationWhatsAppCandidateAttemptStatus.SENT ||
      current.status ===
        StoreConversationWhatsAppCandidateAttemptStatus.OUTCOME_UNKNOWN ||
      current.status ===
        StoreConversationWhatsAppCandidateAttemptStatus.CANCELLED ||
      (current.status ===
        StoreConversationWhatsAppCandidateAttemptStatus.CLAIMED &&
        (!current.claimExpiresAt || current.claimExpiresAt > now))
    ) {
      return null
    }
    const normalizedExternalCustomerId = normalizeRecipient(
      current.candidate.inboundEvent.externalCustomerId,
    )
    await assertStoreConversationWhatsAppCandidateEvidenceCurrent(tx, {
      candidate: current.candidate,
      normalizedExternalCustomerId,
    })
    const source = await loadSingleActiveStoreConversationWhatsAppSource(
      tx,
      current.candidate,
    )
    if (
      !source ||
      source.sourceId !== current.candidate.sourceId ||
      source.sourceKind !== current.candidate.sourceKind ||
      source.sourceRevision !== current.candidate.sourceRevision
    ) {
      return null
    }
    const connection = await resolveCurrentWhatsAppBinding(
      tx,
      current.candidate,
    )
    if (connection.id !== current.connectionId) return null
    const actions = current.candidate.actionCapabilities
      .filter(
        (capability) =>
          capability.status ===
            StoreConversationWhatsAppCandidateActionCapabilityStatus.ACTIVE &&
          capability.expiresAt > now,
      )
      .map((capability) => projectedActions[capability.action])
    if (
      actions.length !== 3 ||
      !actions.includes("continue") ||
      !actions.includes("start_new") ||
      !actions.includes("not_mine")
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp prompt has no current choices.",
      )
    }
    const claimed =
      await tx.storeConversationWhatsAppCandidateAttempt.updateMany({
        data: {
          attemptCount: { increment: 1 },
          claimedAt: now,
          claimExpiresAt: new Date(now.getTime() + CLAIM_LIFETIME_MS),
          claimToken: input.claimToken,
          failureCode: null,
          nextAttemptAt: null,
          status: StoreConversationWhatsAppCandidateAttemptStatus.CLAIMED,
        },
        where: {
          id: current.id,
          status: current.status,
          updatedAt: current.updatedAt,
        },
      })
    if (claimed.count !== 1) return null
    return {
      actions,
      attemptId: current.id,
      candidateId: current.candidateId,
      candidateRevision: current.candidateRevision,
      claimToken: input.claimToken,
      credentialReference: connection.credentialReference,
      externalCustomerId: current.candidate.inboundEvent.externalCustomerId,
      phoneNumberId: connection.phoneNumberId,
    }
  })
}

export async function completeStoreConversationWhatsAppCandidatePrompt(
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
  const updated = await db.storeConversationWhatsAppCandidateAttempt.updateMany(
    {
      data: {
        claimExpiresAt: null,
        claimToken: null,
        providerReferenceDigest: input.providerReferenceDigest,
        sentAt: now,
        status: StoreConversationWhatsAppCandidateAttemptStatus.SENT,
      },
      where: {
        claimToken: input.claimToken,
        id: input.attemptId,
        status: StoreConversationWhatsAppCandidateAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  )
  if (updated.count !== 1) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "CONFLICT",
      "This WhatsApp prompt changed before delivery completed.",
    )
  }
  return { sent: true as const }
}

export async function failStoreConversationWhatsAppCandidatePrompt(
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
  const failureCode = input.failureCode.trim().slice(0, 120)
  const retryAt = input.outcomeUnknown
    ? null
    : new Date(now.getTime() + RETRY_DELAY_MS)
  const updated = await db.storeConversationWhatsAppCandidateAttempt.updateMany(
    {
      data: {
        claimExpiresAt: null,
        claimToken: null,
        failureCode: failureCode || "provider_send_failed",
        nextAttemptAt: retryAt,
        status: input.outcomeUnknown
          ? StoreConversationWhatsAppCandidateAttemptStatus.OUTCOME_UNKNOWN
          : StoreConversationWhatsAppCandidateAttemptStatus.FAILED,
      },
      where: {
        claimToken: input.claimToken,
        id: input.attemptId,
        status: StoreConversationWhatsAppCandidateAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  )
  return updated.count === 1 ? { retryAt } : null
}
