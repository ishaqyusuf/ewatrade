import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationWhatsAppBridgeStatus,
  StoreConversationWhatsAppDirectSessionStatus,
  StoreConversationWhatsAppObservationDirection,
  StoreConversationWhatsAppObservationProvenance,
  StoreConversationWhatsAppObservationStatus,
  StoreConversationWhatsAppOutboundAttemptStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import { resolveCurrentWhatsAppBinding } from "./store-conversation-whatsapp-bridge-repository"
import { StoreConversationWhatsAppDiscoveryError } from "./store-conversation-whatsapp-discovery-repository"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"

const OUTBOUND_CLAIM_LIFETIME_MS = 5 * 60 * 1_000
const OUTBOUND_RETRY_DELAY_MS = 5 * 60 * 1_000

type OutboundRoute = {
  connectionId: string
  conversationId: string
  externalCustomerIdCiphertext: string
  id: string
  sourceId: string | null
  sourceKind:
    | "COMMERCE_INQUIRY"
    | "PRESCRIPTION_REQUEST"
    | "SERVICE_REQUEST"
    | null
  sourceRevision: number | null
  storeId: string
  tenantId: string
}

function assertDigest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp delivery is unavailable.",
    )
  }
}

async function loadCurrentOutboundRoutes(
  tx: Prisma.TransactionClient,
  input: { conversationId: string; storeId: string; tenantId: string },
) {
  const [bridges, directSessions] = await Promise.all([
    tx.storeConversationWhatsAppBridge.findMany({
      select: {
        connectionId: true,
        conversationId: true,
        externalCustomerIdCiphertext: true,
        id: true,
        sourceId: true,
        sourceKind: true,
        sourceRevision: true,
        storeId: true,
        tenantId: true,
      },
      take: 2,
      where: {
        conversationId: input.conversationId,
        status: StoreConversationWhatsAppBridgeStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    tx.storeConversationWhatsAppDirectSession.findMany({
      select: {
        connectionId: true,
        conversationId: true,
        externalCustomerIdCiphertext: true,
        id: true,
        sourceId: true,
        sourceKind: true,
        sourceRevision: true,
        storeId: true,
        tenantId: true,
      },
      take: 2,
      where: {
        conversationId: input.conversationId,
        status: StoreConversationWhatsAppDirectSessionStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  ])
  return {
    bridges: bridges as OutboundRoute[],
    directSessions: directSessions as OutboundRoute[],
  }
}

export async function prepareStoreConversationWhatsAppOutboundAttemptInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    conversationId: string
    messageId: string
    storeId: string
    tenantId: string
  },
) {
  const routes = await loadCurrentOutboundRoutes(tx, input)
  const current = [
    ...routes.bridges.map((route) => ({ kind: "bridge" as const, route })),
    ...routes.directSessions.map((route) => ({
      kind: "direct" as const,
      route,
    })),
  ]
  if (current.length === 0) return null
  if (current.length !== 1) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "CONFLICT",
      "More than one WhatsApp route owns this conversation.",
    )
  }
  const selected = current[0]
  if (!selected) return null
  const attempt = await tx.storeConversationWhatsAppOutboundAttempt.create({
    data: {
      bridgeId: selected.kind === "bridge" ? selected.route.id : null,
      connectionId: selected.route.connectionId,
      conversationId: input.conversationId,
      directSessionId: selected.kind === "direct" ? selected.route.id : null,
      messageId: input.messageId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return {
    attemptId: attempt.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
}

function selectedAttemptRoute(attempt: {
  bridge: OutboundRoute | null
  bridgeId: string | null
  directSession: OutboundRoute | null
  directSessionId: string | null
}) {
  const proofs = [
    ...(attempt.bridgeId && attempt.bridge
      ? [{ kind: "bridge" as const, route: attempt.bridge }]
      : []),
    ...(attempt.directSessionId && attempt.directSession
      ? [{ kind: "direct" as const, route: attempt.directSession }]
      : []),
  ]
  if (proofs.length !== 1) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "CONFLICT",
      "This WhatsApp delivery has an invalid route proof.",
    )
  }
  return proofs[0]
}

export async function claimStoreConversationWhatsAppOutboundAttempt(
  db: PrismaClient,
  input: { attemptId: string; claimToken: string; now?: Date },
) {
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppOutboundAttempt"
      WHERE "id" = ${input.attemptId}
      FOR UPDATE
    `)
    const attempt =
      await tx.storeConversationWhatsAppOutboundAttempt.findUnique({
        include: {
          bridge: true,
          directSession: true,
          message: { select: { body: true, id: true } },
        },
        where: { id: input.attemptId },
      })
    if (!attempt) return null
    if (
      attempt.status ===
        StoreConversationWhatsAppOutboundAttemptStatus.CLAIMED ||
      attempt.status ===
        StoreConversationWhatsAppOutboundAttemptStatus.OUTCOME_UNKNOWN ||
      attempt.status === StoreConversationWhatsAppOutboundAttemptStatus.SENT ||
      attempt.status ===
        StoreConversationWhatsAppOutboundAttemptStatus.CANCELLED
    ) {
      return null
    }
    if (
      attempt.status ===
        StoreConversationWhatsAppOutboundAttemptStatus.FAILED &&
      attempt.nextAttemptAt &&
      attempt.nextAttemptAt > now
    ) {
      return null
    }
    const selected = selectedAttemptRoute(attempt)
    if (!selected) return null
    const route = selected.route
    if (!route.sourceId || !route.sourceKind || route.sourceRevision === null) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_READY",
        "This WhatsApp route has no current Request.",
      )
    }
    const connection = await resolveCurrentWhatsAppBinding(tx, route)
    if (connection.id !== attempt.connectionId) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_READY",
        "WhatsApp routing changed before this reply could be sent.",
      )
    }
    const revision = await resolveCurrentStoreConversationRequestRevision(tx, {
      kind: route.sourceKind,
      sourceId: route.sourceId,
      storeId: route.storeId,
      tenantId: route.tenantId,
    })
    if (revision !== route.sourceRevision) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "The Request changed before this WhatsApp reply could be sent.",
      )
    }
    const claimed =
      await tx.storeConversationWhatsAppOutboundAttempt.updateMany({
        data: {
          attemptCount: { increment: 1 },
          claimedAt: now,
          claimExpiresAt: new Date(now.getTime() + OUTBOUND_CLAIM_LIFETIME_MS),
          claimToken: input.claimToken,
          failureCode: null,
          nextAttemptAt: null,
          status: StoreConversationWhatsAppOutboundAttemptStatus.CLAIMED,
        },
        where: {
          id: attempt.id,
          status: attempt.status,
        },
      })
    if (claimed.count !== 1) return null
    return {
      attemptId: attempt.id,
      connectionId: attempt.connectionId,
      credentialReference: connection.credentialReference,
      phoneNumberId: connection.phoneNumberId,
      recipientCiphertext: route.externalCustomerIdCiphertext,
      text: attempt.message.body,
    }
  })
}

export async function completeStoreConversationWhatsAppOutboundAttempt(
  db: PrismaClient,
  input: {
    attemptId: string
    claimToken: string
    eventDigest: string
    now?: Date
    providerReferenceDigest: string
  },
) {
  assertDigest(input.eventDigest)
  assertDigest(input.providerReferenceDigest)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppOutboundAttempt"
      WHERE "id" = ${input.attemptId}
      FOR UPDATE
    `)
    const attempt =
      await tx.storeConversationWhatsAppOutboundAttempt.findUnique({
        include: { bridge: true, directSession: true },
        where: { id: input.attemptId },
      })
    if (!attempt) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_FOUND",
        "This WhatsApp delivery is unavailable.",
      )
    }
    if (
      attempt.status === StoreConversationWhatsAppOutboundAttemptStatus.SENT
    ) {
      if (attempt.providerReferenceDigest !== input.providerReferenceDigest) {
        throw new StoreConversationWhatsAppDiscoveryError(
          "CONFLICT",
          "This WhatsApp delivery does not match its earlier result.",
        )
      }
      return { replayed: true, status: "sent" as const }
    }
    if (
      attempt.status !==
        StoreConversationWhatsAppOutboundAttemptStatus.CLAIMED ||
      attempt.claimToken !== input.claimToken
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp delivery claim is no longer current.",
      )
    }
    const selected = selectedAttemptRoute(attempt)
    if (!selected) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp delivery has no current route.",
      )
    }
    const observation = await tx.storeConversationWhatsAppObservation.create({
      data: {
        bridgeId: selected.kind === "bridge" ? selected.route.id : null,
        connectionId: attempt.connectionId,
        conversationId: attempt.conversationId,
        directSessionId: selected.kind === "direct" ? selected.route.id : null,
        direction: StoreConversationWhatsAppObservationDirection.OUTBOUND,
        messageId: attempt.messageId,
        provenance:
          StoreConversationWhatsAppObservationProvenance.CLOUD_API_OUTBOUND,
        providerMessageDigest: input.providerReferenceDigest,
        status: StoreConversationWhatsAppObservationStatus.SENT,
        statusOccurredAt: now,
        storeId: attempt.storeId,
        tenantId: attempt.tenantId,
      },
    })
    await tx.storeConversationWhatsAppObservationEvent.create({
      data: {
        eventDigest: input.eventDigest,
        observationId: observation.id,
        occurredAt: now,
        status: StoreConversationWhatsAppObservationStatus.SENT,
        storeId: attempt.storeId,
        tenantId: attempt.tenantId,
      },
    })
    await tx.storeConversationWhatsAppOutboundAttempt.update({
      data: {
        claimExpiresAt: null,
        providerReferenceDigest: input.providerReferenceDigest,
        sentAt: now,
        status: StoreConversationWhatsAppOutboundAttemptStatus.SENT,
      },
      where: { id: attempt.id },
    })
    return { replayed: false, status: "sent" as const }
  })
}

export async function failStoreConversationWhatsAppOutboundAttempt(
  db: PrismaClient,
  input: {
    attemptId: string
    claimToken: string
    failureCode: string
    now?: Date
    outcomeUnknown: boolean
  },
) {
  if (!/^[a-z0-9_]{1,80}$/.test(input.failureCode)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp delivery failure is unavailable.",
    )
  }
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const updated =
      await tx.storeConversationWhatsAppOutboundAttempt.updateMany({
        data: input.outcomeUnknown
          ? {
              claimExpiresAt: null,
              failureCode: input.failureCode,
              nextAttemptAt: null,
              status:
                StoreConversationWhatsAppOutboundAttemptStatus.OUTCOME_UNKNOWN,
            }
          : {
              claimExpiresAt: null,
              claimToken: null,
              failureCode: input.failureCode,
              nextAttemptAt: new Date(now.getTime() + OUTBOUND_RETRY_DELAY_MS),
              status: StoreConversationWhatsAppOutboundAttemptStatus.FAILED,
            },
        where: {
          claimToken: input.claimToken,
          id: input.attemptId,
          status: StoreConversationWhatsAppOutboundAttemptStatus.CLAIMED,
        },
      })
    if (updated.count !== 1) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp delivery claim is no longer current.",
      )
    }
    return {
      status: input.outcomeUnknown
        ? ("outcome_unknown" as const)
        : ("failed" as const),
    }
  })
}
