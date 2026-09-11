import type {
  StoreConversationWhatsAppCandidateAction as SharedCandidateAction,
  StoreConversationWhatsAppObservationProvenance as SharedObservationProvenance,
  StoreConversationWhatsAppObservationStatus as SharedObservationStatus,
} from "@ewatrade/service-commerce"
import {
  STORE_CONVERSATION_WHATSAPP_CANDIDATE_LIFETIME_MS,
  STORE_CONVERSATION_WHATSAPP_CANDIDATE_RECENCY_MS,
  projectCurrentStoreConversationWhatsAppObservedStatus,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationLifecycle,
  StoreConversationModerationState,
  StoreConversationNotificationContactChannel,
  StoreConversationNotificationContactStatus,
  StoreConversationRequestKind,
  StoreConversationWhatsAppBridgeChoice,
  StoreConversationWhatsAppBridgeStatus,
  StoreConversationWhatsAppCandidateAction,
  StoreConversationWhatsAppCandidateEvidenceKind,
  StoreConversationWhatsAppCandidateStatus,
  StoreConversationWhatsAppDirectSessionStatus,
  StoreConversationWhatsAppObservationDirection,
  StoreConversationWhatsAppObservationProvenance,
  StoreConversationWhatsAppObservationStatus,
  WhatsAppInboundEventStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import { resolveCurrentWhatsAppBinding } from "./store-conversation-whatsapp-bridge-repository"
import { appendStoreConversationWhatsAppCustomerTextInTransaction } from "./store-conversation-whatsapp-message-repository"
import {
  loadStoreConversationRequestSummaries,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"
import type { DbClient } from "./types"

export type StoreConversationWhatsAppDiscoveryErrorCode =
  | "CONFLICT"
  | "EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_READY"

export class StoreConversationWhatsAppDiscoveryError extends Error {
  constructor(
    readonly code: StoreConversationWhatsAppDiscoveryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationWhatsAppDiscoveryError"
  }
}

type CandidateTokenServices = {
  deriveActionToken: (input: {
    action: SharedCandidateAction
    candidateId: string
    revision: number
  }) => string
  digestToken: (value: string) => string
}

const candidateActions = {
  continue: StoreConversationWhatsAppCandidateAction.CONTINUE,
  not_mine: StoreConversationWhatsAppCandidateAction.NOT_MINE,
  start_new: StoreConversationWhatsAppCandidateAction.START_NEW,
} satisfies Record<
  SharedCandidateAction,
  StoreConversationWhatsAppCandidateAction
>

function assertDigest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp request is unavailable.",
    )
  }
}

function assertNormalizedRecipient(value: string) {
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp request is unavailable.",
    )
  }
}

function projectSourceKind(
  kind: "commerce_inquiry" | "prescription_request" | "service_request",
) {
  if (kind === "commerce_inquiry") {
    return StoreConversationRequestKind.COMMERCE_INQUIRY
  }
  if (kind === "prescription_request") {
    return StoreConversationRequestKind.PRESCRIPTION_REQUEST
  }
  return StoreConversationRequestKind.SERVICE_REQUEST
}

export async function loadSingleActiveStoreConversationWhatsAppSource(
  db: DbClient,
  input: { conversationId: string; storeId: string; tenantId: string },
) {
  const active = (
    await loadStoreConversationRequestSummaries(db, input)
  ).filter((source) => source.lifecycle === "active")
  const source = active.length === 1 ? active[0] : null
  return source
    ? {
        sourceId: source.id,
        sourceKind: projectSourceKind(source.kind),
        sourceRevision: source.revision,
      }
    : null
}

type CandidateConversation = {
  accountAccess: { accountUserId: string; id: string } | null
  guestIdentity: { notificationContacts: Array<{ id: string }> }
  id: string
  lastActivityAt: Date
  storeId: string
  tenantId: string
}

async function findCandidateConversations(
  db: DbClient,
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    notificationDestinationDigest: string
    normalizedExternalCustomerId: string
    now: Date
    storeId: string
    tenantId: string
  },
) {
  return db.storeConversation.findMany({
    orderBy: [{ lastActivityAt: "desc" }, { id: "asc" }],
    select: {
      accountAccess: { select: { accountUserId: true, id: true } },
      guestIdentity: {
        select: {
          notificationContacts: {
            select: { id: true },
            take: 1,
            where: {
              channel: StoreConversationNotificationContactChannel.WHATSAPP,
              destinationDigest: input.notificationDestinationDigest,
              status: StoreConversationNotificationContactStatus.VERIFIED,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          },
        },
      },
      id: true,
      lastActivityAt: true,
      storeId: true,
      tenantId: true,
    },
    take: 2,
    where: {
      OR: [
        {
          guestIdentity: {
            notificationContacts: {
              some: {
                channel: StoreConversationNotificationContactChannel.WHATSAPP,
                destinationDigest: input.notificationDestinationDigest,
                status: StoreConversationNotificationContactStatus.VERIFIED,
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
            },
          },
        },
        {
          accountAccess: {
            is: {
              accountUser: {
                phone: input.normalizedExternalCustomerId,
                phoneVerifiedAt: { not: null },
              },
              status: "ACTIVE",
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          },
        },
      ],
      lastActivityAt: {
        gte: new Date(
          input.now.getTime() -
            STORE_CONVERSATION_WHATSAPP_CANDIDATE_RECENCY_MS,
        ),
      },
      lifecycle: StoreConversationLifecycle.ACTIVE,
      moderationState: StoreConversationModerationState.OPEN,
      storeId: input.storeId,
      whatsAppCandidateSuppressions: {
        none: {
          connectionId: input.connectionId,
          expiresAt: { gt: input.now },
          externalCustomerIdDigest: input.externalCustomerIdDigest,
        },
      },
      tenantId: input.tenantId,
    },
  }) as Promise<CandidateConversation[]>
}

function evidenceForCandidate(candidate: CandidateConversation) {
  const contact = candidate.guestIdentity.notificationContacts[0]
  if (contact) {
    return {
      accountAccessId: null,
      accountUserId: null,
      evidenceKind:
        StoreConversationWhatsAppCandidateEvidenceKind.GUEST_VERIFIED_CONTACT,
      notificationContactId: contact.id,
    }
  }
  if (candidate.accountAccess) {
    return {
      accountAccessId: candidate.accountAccess.id,
      accountUserId: candidate.accountAccess.accountUserId,
      evidenceKind:
        StoreConversationWhatsAppCandidateEvidenceKind.ACCOUNT_VERIFIED_PHONE,
      notificationContactId: null,
    }
  }
  throw new StoreConversationWhatsAppDiscoveryError(
    "NOT_READY",
    "A recent Store conversation could not be verified.",
  )
}

function projectCandidateReplay(
  candidate: {
    connectionId: string
    externalCustomerIdDigest: string
    expiresAt: Date
    id: string
    status: StoreConversationWhatsAppCandidateStatus
    storeId: string
    tenantId: string
  },
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    now: Date
    storeId: string
    tenantId: string
  },
) {
  if (
    candidate.connectionId !== input.connectionId ||
    candidate.externalCustomerIdDigest !== input.externalCustomerIdDigest ||
    candidate.storeId !== input.storeId ||
    candidate.tenantId !== input.tenantId
  ) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp request is unavailable.",
    )
  }
  if (
    candidate.status !== StoreConversationWhatsAppCandidateStatus.PENDING ||
    candidate.expiresAt <= input.now
  ) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "EXPIRED",
      "This WhatsApp choice is no longer available.",
    )
  }
  return {
    candidateId: candidate.id,
    replayed: true,
    state: "held" as const,
  }
}

export async function discoverStoreConversationWhatsAppCandidate(
  db: PrismaClient,
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    inboundEventId: string
    notificationDestinationDigest: string
    normalizedExternalCustomerId: string
    now?: Date
    providerEventDigest: string
    storeId: string
    tenantId: string
    tokenServices: CandidateTokenServices
  },
) {
  assertDigest(input.externalCustomerIdDigest)
  assertDigest(input.notificationDestinationDigest)
  assertDigest(input.providerEventDigest)
  assertNormalizedRecipient(input.normalizedExternalCustomerId)
  const now = input.now ?? new Date()
  const existing = await db.storeConversationWhatsAppCandidate.findUnique({
    where: { inboundEventId: input.inboundEventId },
  })
  if (existing) {
    return projectCandidateReplay(existing, { ...input, now })
  }

  const conversations = await findCandidateConversations(db, {
    ...input,
    now,
  })
  if (conversations.length === 0) {
    return { replayed: false, state: "new_request" as const }
  }
  if (conversations.length !== 1) {
    return { replayed: false, state: "ambiguous" as const }
  }
  const conversation = conversations[0]
  if (!conversation) {
    return { replayed: false, state: "new_request" as const }
  }
  const source = await loadSingleActiveStoreConversationWhatsAppSource(db, {
    conversationId: conversation.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  if (!source) {
    return { replayed: false, state: "ambiguous" as const }
  }
  const evidence = evidenceForCandidate(conversation)

  return runStoreConversationActionTransaction(db, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "WhatsAppInboundEvent"
      WHERE "id" = ${input.inboundEventId}
      FOR UPDATE
    `)
    const event = await tx.whatsAppInboundEvent.findUnique({
      select: {
        connectionId: true,
        id: true,
        status: true,
        storeId: true,
        tenantId: true,
      },
      where: { id: input.inboundEventId },
    })
    if (
      !event ||
      event.connectionId !== input.connectionId ||
      event.storeId !== input.storeId ||
      event.tenantId !== input.tenantId
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "FORBIDDEN",
        "This WhatsApp request is unavailable.",
      )
    }
    const replay = await tx.storeConversationWhatsAppCandidate.findUnique({
      where: { inboundEventId: event.id },
    })
    if (replay) {
      return projectCandidateReplay(replay, { ...input, now })
    }
    if (event.status !== WhatsAppInboundEventStatus.RECEIVED) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp request is already being handled.",
      )
    }
    const candidate = await tx.storeConversationWhatsAppCandidate.create({
      data: {
        ...evidence,
        connectionId: input.connectionId,
        conversationId: conversation.id,
        expiresAt: new Date(
          now.getTime() + STORE_CONVERSATION_WHATSAPP_CANDIDATE_LIFETIME_MS,
        ),
        externalCustomerIdDigest: input.externalCustomerIdDigest,
        inboundProviderEventDigest: input.providerEventDigest,
        inboundEventId: event.id,
        notificationDestinationDigest: input.notificationDestinationDigest,
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceRevision: source.sourceRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const capabilities = (
      Object.keys(candidateActions) as SharedCandidateAction[]
    ).map((action) => {
      const token = input.tokenServices.deriveActionToken({
        action,
        candidateId: candidate.id,
        revision: candidate.revision,
      })
      const tokenDigest = input.tokenServices.digestToken(token)
      assertDigest(tokenDigest)
      return {
        action: candidateActions[action],
        candidateId: candidate.id,
        candidateRevision: candidate.revision,
        expiresAt: candidate.expiresAt,
        storeId: input.storeId,
        tenantId: input.tenantId,
        tokenDigest,
      }
    })
    await tx.storeConversationWhatsAppCandidateActionCapability.createMany({
      data: capabilities,
    })
    await tx.storeConversationWhatsAppCandidateAttempt.create({
      data: {
        candidateId: candidate.id,
        candidateRevision: candidate.revision,
        connectionId: input.connectionId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const held = await tx.whatsAppInboundEvent.updateMany({
      data: { status: WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE },
      where: {
        connectionId: input.connectionId,
        id: event.id,
        status: WhatsAppInboundEventStatus.RECEIVED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (held.count !== 1) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp request changed while it was being prepared.",
      )
    }
    return {
      candidateId: candidate.id,
      replayed: false,
      state: "held" as const,
    }
  })
}

export async function assertStoreConversationWhatsAppCandidateEvidenceCurrent(
  tx: Prisma.TransactionClient,
  input: {
    candidate: {
      accountAccessId: string | null
      accountUserId: string | null
      conversation: { guestIdentityId: string }
      conversationId: string
      evidenceKind: StoreConversationWhatsAppCandidateEvidenceKind
      notificationContactId: string | null
      notificationDestinationDigest: string
      storeId: string
      tenantId: string
    }
    normalizedExternalCustomerId: string
  },
) {
  if (
    input.candidate.evidenceKind ===
    StoreConversationWhatsAppCandidateEvidenceKind.GUEST_VERIFIED_CONTACT
  ) {
    if (!input.candidate.notificationContactId) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "FORBIDDEN",
        "This recent conversation could not be verified.",
      )
    }
    const contact =
      await tx.storeConversationGuestNotificationContact.findFirst({
        select: { id: true },
        where: {
          channel: StoreConversationNotificationContactChannel.WHATSAPP,
          destinationDigest:
            input.candidate.notificationDestinationDigest,
          guestIdentityId: input.candidate.conversation.guestIdentityId,
          id: input.candidate.notificationContactId,
          status: StoreConversationNotificationContactStatus.VERIFIED,
          storeId: input.candidate.storeId,
          tenantId: input.candidate.tenantId,
        },
      })
    if (contact) {
      return {
        accountAccessId: null,
        guestIdentityId: input.candidate.conversation.guestIdentityId,
      }
    }
  } else if (input.candidate.accountAccessId && input.candidate.accountUserId) {
    const access = await tx.storeConversationAccountAccess.findFirst({
      select: { id: true },
      where: {
        accountUser: {
          id: input.candidate.accountUserId,
          phone: input.normalizedExternalCustomerId,
          phoneVerifiedAt: { not: null },
        },
        accountUserId: input.candidate.accountUserId,
        conversationId: input.candidate.conversationId,
        id: input.candidate.accountAccessId,
        status: "ACTIVE",
        storeId: input.candidate.storeId,
        tenantId: input.candidate.tenantId,
      },
    })
    if (access) {
      return { accountAccessId: access.id, guestIdentityId: null }
    }
  }
  throw new StoreConversationWhatsAppDiscoveryError(
    "FORBIDDEN",
    "This recent conversation could not be verified.",
  )
}

function assertCandidateCapabilityCurrent(
  capability: {
    candidate: {
      connectionId: string
      expiresAt: Date
      externalCustomerIdDigest: string
      inboundEvent: { status: WhatsAppInboundEventStatus }
      revision: number
      status: StoreConversationWhatsAppCandidateStatus
    }
    candidateRevision: number
    expiresAt: Date
    status: string
  },
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    now: Date
  },
) {
  if (
    capability.candidate.connectionId !== input.connectionId ||
    capability.candidate.externalCustomerIdDigest !==
      input.externalCustomerIdDigest
  ) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp choice is unavailable.",
    )
  }
  if (
    capability.status !== "ACTIVE" ||
    capability.expiresAt <= input.now ||
    capability.candidate.status !==
      StoreConversationWhatsAppCandidateStatus.PENDING ||
    capability.candidate.expiresAt <= input.now ||
    capability.candidate.revision !== capability.candidateRevision ||
    capability.candidate.inboundEvent.status !==
      WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE
  ) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "EXPIRED",
      "This WhatsApp choice is no longer available.",
    )
  }
}

function assertCandidateRecipient(
  candidate: {
    connectionId: string
    externalCustomerIdDigest: string
    storeId: string
    tenantId: string
  },
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    storeId: string
    tenantId: string
  },
) {
  if (
    candidate.connectionId !== input.connectionId ||
    candidate.externalCustomerIdDigest !== input.externalCustomerIdDigest ||
    candidate.storeId !== input.storeId ||
    candidate.tenantId !== input.tenantId
  ) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp choice is unavailable.",
    )
  }
}

async function projectCandidateChoiceReplay(
  tx: Prisma.TransactionClient,
  capability: {
    action: StoreConversationWhatsAppCandidateAction
    candidate: {
      conversationId: string
      id: string
      inboundEventId: string
      status: StoreConversationWhatsAppCandidateStatus
    }
    status: string
  },
) {
  if (capability.status !== "CONSUMED") return null
  if (
    capability.action === StoreConversationWhatsAppCandidateAction.CONTINUE &&
    capability.candidate.status ===
      StoreConversationWhatsAppCandidateStatus.CONTINUED
  ) {
    const bridge = await tx.storeConversationWhatsAppBridge.findUnique({
      select: { conversationId: true, id: true },
      where: { candidateId: capability.candidate.id },
    })
    if (bridge) {
      return {
        bridgeId: bridge.id,
        conversationId: bridge.conversationId,
        replayed: true,
        state: "continued" as const,
      }
    }
  }
  if (
    capability.action === StoreConversationWhatsAppCandidateAction.START_NEW &&
    capability.candidate.status ===
      StoreConversationWhatsAppCandidateStatus.STARTED_NEW
  ) {
    return {
      inboundEventId: capability.candidate.inboundEventId,
      replayed: true,
      state: "start_new" as const,
    }
  }
  if (
    capability.action === StoreConversationWhatsAppCandidateAction.NOT_MINE &&
    capability.candidate.status ===
      StoreConversationWhatsAppCandidateStatus.REJECTED
  ) {
    return { replayed: true, state: "rejected" as const }
  }
  throw new StoreConversationWhatsAppDiscoveryError(
    "CONFLICT",
    "This WhatsApp choice does not match its earlier result.",
  )
}

async function consumeCandidateCapability(
  tx: Prisma.TransactionClient,
  input: { capabilityId: string; candidateId: string; now: Date },
) {
  await tx.storeConversationWhatsAppCandidateActionCapability.update({
    data: { consumedAt: input.now, status: "CONSUMED" },
    where: { id: input.capabilityId },
  })
  await tx.storeConversationWhatsAppCandidateActionCapability.updateMany({
    data: { revokedAt: input.now, status: "REVOKED" },
    where: {
      candidateId: input.candidateId,
      id: { not: input.capabilityId },
      status: "ACTIVE",
    },
  })
  await tx.storeConversationWhatsAppCandidateAttempt.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      failureCode: "candidate_choice_completed",
      nextAttemptAt: null,
      status: "CANCELLED",
    },
    where: {
      candidateId: input.candidateId,
      status: { in: ["PENDING", "CLAIMED", "FAILED"] },
    },
  })
}

function translateMessageError(error: unknown): never {
  if (!(error instanceof Error)) throw error
  if (error.message === "WHATSAPP_MESSAGE_IDEMPOTENCY_MISMATCH") {
    throw new StoreConversationWhatsAppDiscoveryError(
      "CONFLICT",
      "This WhatsApp message does not match its earlier delivery.",
    )
  }
  if (
    error.message === "WHATSAPP_MESSAGE_SOURCE_CHANGED" ||
    error.message === "WHATSAPP_CONVERSATION_CHANGED"
  ) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "CONFLICT",
      "That conversation changed. Start again from the Store link.",
    )
  }
  if (error.message === "WHATSAPP_CONVERSATION_NOT_READY") {
    throw new StoreConversationWhatsAppDiscoveryError(
      "NOT_READY",
      "This Store conversation cannot continue on WhatsApp right now.",
    )
  }
  throw error
}

export async function selectStoreConversationWhatsAppCandidateAction(
  db: PrismaClient,
  input: {
    actionTokenDigest: string
    connectionId: string
    externalCustomerIdCiphertext: string
    externalCustomerIdDigest: string
    normalizedExternalCustomerId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  assertDigest(input.actionTokenDigest)
  assertDigest(input.externalCustomerIdDigest)
  assertNormalizedRecipient(input.normalizedExternalCustomerId)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const capability =
      await tx.storeConversationWhatsAppCandidateActionCapability.findUnique({
        include: {
          candidate: {
            include: { conversation: true, inboundEvent: true },
          },
        },
        where: { tokenDigest: input.actionTokenDigest },
      })
    if (!capability) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_FOUND",
        "This WhatsApp choice is unavailable.",
      )
    }
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppCandidateActionCapability"
      WHERE "id" = ${capability.id}
      FOR UPDATE
    `)
    const current =
      await tx.storeConversationWhatsAppCandidateActionCapability.findUnique({
        include: {
          candidate: {
            include: { conversation: true, inboundEvent: true },
          },
        },
        where: { id: capability.id },
      })
    if (!current) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_FOUND",
        "This WhatsApp choice is unavailable.",
      )
    }
    assertCandidateRecipient(current.candidate, input)
    const replay = await projectCandidateChoiceReplay(tx, current)
    if (replay) return replay
    assertCandidateCapabilityCurrent(current, { ...input, now })
    const candidate = current.candidate
    assertDigest(candidate.inboundProviderEventDigest)
    const normalizedPayload = candidate.inboundEvent.normalizedPayload
    const heldText =
      normalizedPayload &&
      typeof normalizedPayload === "object" &&
      !Array.isArray(normalizedPayload) &&
      typeof normalizedPayload.text === "string"
        ? normalizedPayload.text.trim()
        : ""
    if (!heldText || heldText.length > 2_000) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp message cannot be added to the conversation.",
      )
    }
    const evidence =
      await assertStoreConversationWhatsAppCandidateEvidenceCurrent(tx, {
        candidate,
        normalizedExternalCustomerId: input.normalizedExternalCustomerId,
      })
    const connection = await resolveCurrentWhatsAppBinding(tx, candidate)
    if (connection.id !== candidate.connectionId) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the Store link.",
      )
    }
    const source = await loadSingleActiveStoreConversationWhatsAppSource(
      tx,
      candidate,
    )
    if (
      !source ||
      source.sourceId !== candidate.sourceId ||
      source.sourceKind !== candidate.sourceKind ||
      source.sourceRevision !== candidate.sourceRevision
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "That request changed. Start a new request instead.",
      )
    }

    if (current.action === StoreConversationWhatsAppCandidateAction.NOT_MINE) {
      await tx.storeConversationWhatsAppCandidateSuppression.upsert({
        create: {
          candidateId: candidate.id,
          connectionId: candidate.connectionId,
          conversationId: candidate.conversationId,
          expiresAt: new Date(
            now.getTime() + STORE_CONVERSATION_WHATSAPP_CANDIDATE_RECENCY_MS,
          ),
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          lastRejectedAt: now,
          reasonCode: "customer_rejected_candidate",
          storeId: candidate.storeId,
          tenantId: candidate.tenantId,
        },
        update: {
          candidateId: candidate.id,
          expiresAt: new Date(
            now.getTime() + STORE_CONVERSATION_WHATSAPP_CANDIDATE_RECENCY_MS,
          ),
          lastRejectedAt: now,
          reasonCode: "customer_rejected_candidate",
          rejectionCount: { increment: 1 },
        },
        where: {
          storeId_connectionId_externalCustomerIdDigest_conversationId: {
            connectionId: candidate.connectionId,
            conversationId: candidate.conversationId,
            externalCustomerIdDigest: input.externalCustomerIdDigest,
            storeId: candidate.storeId,
          },
        },
      })
      await tx.storeConversationWhatsAppCandidate.update({
        data: { rejectedAt: now, status: "REJECTED" },
        where: { id: candidate.id },
      })
      const ignored = await tx.whatsAppInboundEvent.updateMany({
        data: { status: WhatsAppInboundEventStatus.IGNORED },
        where: {
          id: candidate.inboundEventId,
          status: WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE,
        },
      })
      if (ignored.count !== 1) {
        throw new StoreConversationWhatsAppDiscoveryError(
          "CONFLICT",
          "This WhatsApp request changed while it was being handled.",
        )
      }
      await consumeCandidateCapability(tx, {
        candidateId: candidate.id,
        capabilityId: current.id,
        now,
      })
      return { replayed: false, state: "rejected" as const }
    }

    if (current.action === StoreConversationWhatsAppCandidateAction.START_NEW) {
      await tx.storeConversationWhatsAppCandidate.update({
        data: { selectedAt: now, status: "STARTED_NEW" },
        where: { id: candidate.id },
      })
      const released = await tx.whatsAppInboundEvent.updateMany({
        data: { status: WhatsAppInboundEventStatus.RECEIVED },
        where: {
          id: candidate.inboundEventId,
          status: WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE,
        },
      })
      if (released.count !== 1) {
        throw new StoreConversationWhatsAppDiscoveryError(
          "CONFLICT",
          "This WhatsApp request changed while it was being handled.",
        )
      }
      await consumeCandidateCapability(tx, {
        candidateId: candidate.id,
        capabilityId: current.id,
        now,
      })
      return {
        inboundEventId: candidate.inboundEventId,
        replayed: false,
        state: "start_new" as const,
      }
    }

    let appended: Awaited<
      ReturnType<
        typeof appendStoreConversationWhatsAppCustomerTextInTransaction
      >
    >
    try {
      appended = await appendStoreConversationWhatsAppCustomerTextInTransaction(
        tx,
        {
          auditReasonCode:
            candidate.evidenceKind ===
            StoreConversationWhatsAppCandidateEvidenceKind.ACCOUNT_VERIFIED_PHONE
              ? "whatsapp_candidate_account_message"
              : "whatsapp_candidate_guest_message",
          now,
          providerEventDigest: candidate.inboundProviderEventDigest,
          route: {
            conversationId: candidate.conversationId,
            id: candidate.id,
            revision: candidate.revision,
            storeId: candidate.storeId,
            tenantId: candidate.tenantId,
          },
          source,
          text: heldText,
        },
      )
    } catch (error) {
      translateMessageError(error)
    }
    await tx.storeConversationWhatsAppBridgeChoiceCapability.updateMany({
      data: { revokedAt: now, status: "REVOKED" },
      where: {
        bridge: {
          connectionId: candidate.connectionId,
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          storeId: candidate.storeId,
          status: {
            in: ["AWAITING_CHOICE", "AWAITING_REQUEST_KIND", "ACTIVE"],
          },
        },
        status: "ACTIVE",
      },
    })
    await tx.storeConversationWhatsAppBridgeAttempt.updateMany({
      data: {
        claimExpiresAt: null,
        claimToken: null,
        failureCode: "candidate_bridge_superseded_route",
        nextAttemptAt: null,
        status: "CANCELLED",
      },
      where: {
        bridge: {
          connectionId: candidate.connectionId,
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          storeId: candidate.storeId,
          status: {
            in: ["AWAITING_CHOICE", "AWAITING_REQUEST_KIND", "ACTIVE"],
          },
        },
        status: { in: ["PENDING", "CLAIMED", "FAILED"] },
      },
    })
    const bridge = await tx.storeConversationWhatsAppBridge.upsert({
      create: {
        accountAccessId: evidence.accountAccessId,
        candidateId: candidate.id,
        capabilityId: null,
        choice: StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST,
        choiceAt: now,
        connectionId: candidate.connectionId,
        conversationId: candidate.conversationId,
        externalCustomerIdCiphertext: input.externalCustomerIdCiphertext,
        externalCustomerIdDigest: input.externalCustomerIdDigest,
        guestIdentityId: evidence.guestIdentityId,
        linkedMessageId: appended.message.id,
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceRevision: source.sourceRevision,
        status: StoreConversationWhatsAppBridgeStatus.ACTIVE,
        storeId: candidate.storeId,
        tenantId: candidate.tenantId,
      },
      update: {
        accountAccessId: evidence.accountAccessId,
        candidateId: candidate.id,
        capabilityId: null,
        choice: StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST,
        choiceAt: now,
        conversationId: candidate.conversationId,
        externalCustomerIdCiphertext: input.externalCustomerIdCiphertext,
        guestIdentityId: evidence.guestIdentityId,
        linkedAt: now,
        linkedMessageId: appended.message.id,
        revision: { increment: 1 },
        revokedAt: null,
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceRevision: source.sourceRevision,
        status: StoreConversationWhatsAppBridgeStatus.ACTIVE,
      },
      where: {
        storeId_connectionId_externalCustomerIdDigest: {
          connectionId: candidate.connectionId,
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          storeId: candidate.storeId,
        },
      },
    })
    const observation = await tx.storeConversationWhatsAppObservation.create({
      data: {
        bridgeId: bridge.id,
        connectionId: candidate.connectionId,
        conversationId: candidate.conversationId,
        direction: StoreConversationWhatsAppObservationDirection.INBOUND,
        inboundEventId: candidate.inboundEventId,
        messageId: appended.message.id,
        provenance:
          StoreConversationWhatsAppObservationProvenance.CLOUD_API_INBOUND,
        providerMessageDigest: candidate.inboundProviderEventDigest,
        status: StoreConversationWhatsAppObservationStatus.RECEIVED,
        statusOccurredAt: now,
        storeId: candidate.storeId,
        tenantId: candidate.tenantId,
      },
    })
    await tx.storeConversationWhatsAppObservationEvent.create({
      data: {
        eventDigest: storeConversationPayloadHash({
          occurredAt: now.toISOString(),
          providerEventDigest: candidate.inboundProviderEventDigest,
          status: "received",
        }),
        observationId: observation.id,
        occurredAt: now,
        status: StoreConversationWhatsAppObservationStatus.RECEIVED,
        storeId: candidate.storeId,
        tenantId: candidate.tenantId,
      },
    })
    await tx.storeConversationWhatsAppCandidate.update({
      data: { selectedAt: now, status: "CONTINUED" },
      where: { id: candidate.id },
    })
    const processed = await tx.whatsAppInboundEvent.updateMany({
      data: {
        processedAt: now,
        requestId: source.sourceId,
        status: WhatsAppInboundEventStatus.PROCESSED,
      },
      where: {
        id: candidate.inboundEventId,
        status: WhatsAppInboundEventStatus.AWAITING_CUSTOMER_CHOICE,
      },
    })
    if (processed.count !== 1) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp request changed while it was being handled.",
      )
    }
    await consumeCandidateCapability(tx, {
      candidateId: candidate.id,
      capabilityId: current.id,
      now,
    })
    return {
      bridgeId: bridge.id,
      conversationId: candidate.conversationId,
      replayed: appended.replayed,
      state: "continued" as const,
    }
  })
}

export async function bindStoreConversationWhatsAppDirectSession(
  db: PrismaClient,
  input: {
    connectionId: string
    conversationId?: string
    externalCustomerIdCiphertext: string
    externalCustomerIdDigest: string
    inboundEventId: string
    now?: Date
    providerEventDigest: string
    providerMessageDigest: string
    sourceId: string
    sourceKind: StoreConversationRequestKind
    sourceRevision?: number
    storeId: string
    tenantId: string
    text: string
  },
) {
  assertDigest(input.externalCustomerIdDigest)
  assertDigest(input.providerEventDigest)
  assertDigest(input.providerMessageDigest)
  const text = input.text.trim()
  if (!text || text.length > 2_000) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "CONFLICT",
      "This WhatsApp message cannot be added to the conversation.",
    )
  }
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const replay = await tx.storeConversationWhatsAppObservation.findUnique({
      include: { directSession: true },
      where: { inboundEventId: input.inboundEventId },
    })
    if (replay) {
      if (
        replay.connectionId !== input.connectionId ||
        (input.conversationId &&
          replay.conversationId !== input.conversationId) ||
        replay.providerMessageDigest !== input.providerMessageDigest ||
        replay.storeId !== input.storeId ||
        replay.tenantId !== input.tenantId ||
        !replay.directSession ||
        replay.directSession.sourceId !== input.sourceId ||
        replay.directSession.sourceKind !== input.sourceKind ||
        (input.sourceRevision !== undefined &&
          replay.directSession.sourceRevision !== input.sourceRevision)
      ) {
        throw new StoreConversationWhatsAppDiscoveryError(
          "CONFLICT",
          "This WhatsApp request does not match its earlier result.",
        )
      }
      return {
        conversationId: replay.conversationId,
        directSessionId: replay.directSession.id,
        replayed: true,
      }
    }
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "WhatsAppInboundEvent"
      WHERE "id" = ${input.inboundEventId}
      FOR UPDATE
    `)
    const event = await tx.whatsAppInboundEvent.findUnique({
      select: {
        connectionId: true,
        id: true,
        status: true,
        storeId: true,
        tenantId: true,
      },
      where: { id: input.inboundEventId },
    })
    if (
      !event ||
      event.connectionId !== input.connectionId ||
      event.storeId !== input.storeId ||
      event.tenantId !== input.tenantId
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "FORBIDDEN",
        "This WhatsApp request is unavailable.",
      )
    }
    if (event.status !== WhatsAppInboundEventStatus.PROCESSING) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp request is not ready to be connected.",
      )
    }
    const connection = await resolveCurrentWhatsAppBinding(tx, input)
    if (connection.id !== input.connectionId) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the Store link.",
      )
    }
    const currentRevision =
      await resolveCurrentStoreConversationRequestRevision(tx, {
        kind: input.sourceKind,
        sourceId: input.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    if (
      input.sourceRevision !== undefined &&
      currentRevision !== input.sourceRevision
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "That request changed before WhatsApp could be connected.",
      )
    }
    const sourceRevision = currentRevision
    const existing = await tx.storeConversationWhatsAppDirectSession.findUnique(
      {
        where: {
          storeId_connectionId_externalCustomerIdDigest: {
            connectionId: input.connectionId,
            externalCustomerIdDigest: input.externalCustomerIdDigest,
            storeId: input.storeId,
          },
        },
      },
    )
    if (
      existing &&
      input.conversationId &&
      existing.conversationId !== input.conversationId
    ) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "Another current WhatsApp conversation already owns this Store route.",
      )
    }
    let conversationId = input.conversationId ?? existing?.conversationId
    if (!conversationId) {
      const guestIdentity = await tx.storeConversationGuestIdentity.create({
        data: { lastSeenAt: now },
      })
      const conversation = await tx.storeConversation.create({
        data: {
          guestIdentityId: guestIdentity.id,
          lastActivityAt: now,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: { id: true },
      })
      conversationId = conversation.id
    }
    const directSession =
      await tx.storeConversationWhatsAppDirectSession.upsert({
        create: {
          connectionId: input.connectionId,
          conversationId,
          externalCustomerIdCiphertext: input.externalCustomerIdCiphertext,
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          sourceRevision,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        update: {
          externalCustomerIdCiphertext: input.externalCustomerIdCiphertext,
          conversationId,
          linkedAt: now,
          revokedAt: null,
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          sourceRevision,
          status: StoreConversationWhatsAppDirectSessionStatus.ACTIVE,
        },
        where: {
          storeId_connectionId_externalCustomerIdDigest: {
            connectionId: input.connectionId,
            externalCustomerIdDigest: input.externalCustomerIdDigest,
            storeId: input.storeId,
          },
        },
      })
    let appended: Awaited<
      ReturnType<
        typeof appendStoreConversationWhatsAppCustomerTextInTransaction
      >
    >
    try {
      appended = await appendStoreConversationWhatsAppCustomerTextInTransaction(
        tx,
        {
          auditReasonCode: "whatsapp_direct_message",
          now,
          providerEventDigest: input.providerEventDigest,
          route: directSession,
          source: {
            sourceId: input.sourceId,
            sourceKind: input.sourceKind,
            sourceRevision,
          },
          text,
        },
      )
    } catch (error) {
      translateMessageError(error)
    }
    const observation = await tx.storeConversationWhatsAppObservation.create({
      data: {
        connectionId: input.connectionId,
        conversationId,
        directSessionId: directSession.id,
        direction: StoreConversationWhatsAppObservationDirection.INBOUND,
        inboundEventId: event.id,
        messageId: appended.message.id,
        provenance:
          StoreConversationWhatsAppObservationProvenance.CLOUD_API_INBOUND,
        providerMessageDigest: input.providerMessageDigest,
        status: StoreConversationWhatsAppObservationStatus.RECEIVED,
        statusOccurredAt: now,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.storeConversationWhatsAppObservationEvent.create({
      data: {
        eventDigest: storeConversationPayloadHash({
          occurredAt: now.toISOString(),
          providerEventDigest: input.providerEventDigest,
          status: "received",
        }),
        observationId: observation.id,
        occurredAt: now,
        status: StoreConversationWhatsAppObservationStatus.RECEIVED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const processed = await tx.whatsAppInboundEvent.updateMany({
      data: {
        processedAt: now,
        requestId: input.sourceId,
        status: WhatsAppInboundEventStatus.PROCESSED,
      },
      where: {
        connectionId: input.connectionId,
        id: event.id,
        status: WhatsAppInboundEventStatus.PROCESSING,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (processed.count !== 1) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "CONFLICT",
        "This WhatsApp request changed while it was being connected.",
      )
    }
    return {
      conversationId,
      directSessionId: directSession.id,
      replayed: appended.replayed,
    }
  })
}

const observationStatus = {
  deleted: StoreConversationWhatsAppObservationStatus.DELETED,
  delivered: StoreConversationWhatsAppObservationStatus.DELIVERED,
  failed: StoreConversationWhatsAppObservationStatus.FAILED,
  read: StoreConversationWhatsAppObservationStatus.READ,
  received: StoreConversationWhatsAppObservationStatus.RECEIVED,
  sent: StoreConversationWhatsAppObservationStatus.SENT,
  unsupported: StoreConversationWhatsAppObservationStatus.UNSUPPORTED,
} satisfies Record<
  SharedObservationStatus,
  StoreConversationWhatsAppObservationStatus
>

const sharedObservationStatus = Object.fromEntries(
  Object.entries(observationStatus).map(([shared, database]) => [
    database,
    shared,
  ]),
) as Record<StoreConversationWhatsAppObservationStatus, SharedObservationStatus>

const sharedObservationProvenance = {
  BUSINESS_APP_ECHO: "business_app_echo",
  BUSINESS_APP_HISTORY: "business_app_history",
  CLOUD_API_INBOUND: "cloud_api_inbound",
  CLOUD_API_OUTBOUND: "cloud_api_outbound",
} satisfies Record<string, SharedObservationProvenance>

export async function recordStoreConversationWhatsAppObservationStatus(
  db: PrismaClient,
  input: {
    connectionId: string
    eventDigest: string
    failureCode?: string | null
    occurredAt: Date
    providerMessageDigest: string
    status: SharedObservationStatus
  },
) {
  assertDigest(input.eventDigest)
  assertDigest(input.providerMessageDigest)
  if (input.failureCode && !/^[a-z0-9_]{1,80}$/.test(input.failureCode)) {
    throw new StoreConversationWhatsAppDiscoveryError(
      "FORBIDDEN",
      "This WhatsApp status is unavailable.",
    )
  }
  return runStoreConversationActionTransaction(db, async (tx) => {
    const observation =
      await tx.storeConversationWhatsAppObservation.findUnique({
        where: { providerMessageDigest: input.providerMessageDigest },
      })
    if (!observation) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "NOT_FOUND",
        "This WhatsApp status does not match an observed message.",
      )
    }
    if (observation.connectionId !== input.connectionId) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "FORBIDDEN",
        "This WhatsApp status is unavailable.",
      )
    }
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppObservation"
      WHERE "id" = ${observation.id}
      FOR UPDATE
    `)
    const current = await tx.storeConversationWhatsAppObservation.findUnique({
      where: { id: observation.id },
    })
    if (!current || current.connectionId !== input.connectionId) {
      throw new StoreConversationWhatsAppDiscoveryError(
        "FORBIDDEN",
        "This WhatsApp status is unavailable.",
      )
    }
    const replay =
      await tx.storeConversationWhatsAppObservationEvent.findUnique({
        where: { eventDigest: input.eventDigest },
      })
    if (replay) {
      if (
        replay.observationId !== current.id ||
        replay.status !== observationStatus[input.status] ||
        replay.occurredAt.getTime() !== input.occurredAt.getTime() ||
        replay.failureCode !== (input.failureCode ?? null)
      ) {
        throw new StoreConversationWhatsAppDiscoveryError(
          "CONFLICT",
          "This WhatsApp status does not match its earlier receipt.",
        )
      }
      return {
        occurredAt: current.statusOccurredAt,
        replayed: true,
        status: sharedObservationStatus[current.status],
      }
    }
    await tx.storeConversationWhatsAppObservationEvent.create({
      data: {
        eventDigest: input.eventDigest,
        failureCode: input.failureCode ?? null,
        observationId: current.id,
        occurredAt: input.occurredAt,
        status: observationStatus[input.status],
        storeId: current.storeId,
        tenantId: current.tenantId,
      },
    })
    const projected = projectCurrentStoreConversationWhatsAppObservedStatus([
      {
        occurredAt: current.statusOccurredAt,
        provenance:
          sharedObservationProvenance[current.provenance] ??
          "cloud_api_outbound",
        status: sharedObservationStatus[current.status],
      },
      {
        occurredAt: input.occurredAt,
        provenance:
          sharedObservationProvenance[current.provenance] ??
          "cloud_api_outbound",
        status: input.status,
      },
    ])
    if (
      projected &&
      (projected.status !== sharedObservationStatus[current.status] ||
        projected.occurredAt.getTime() !== current.statusOccurredAt.getTime())
    ) {
      await tx.storeConversationWhatsAppObservation.update({
        data: {
          failureCode:
            projected.status === input.status
              ? (input.failureCode ?? null)
              : current.failureCode,
          status: observationStatus[projected.status],
          statusOccurredAt: projected.occurredAt,
        },
        where: { id: current.id },
      })
    }
    return {
      occurredAt: projected?.occurredAt ?? current.statusOccurredAt,
      replayed: false,
      status: projected?.status ?? sharedObservationStatus[current.status],
    }
  })
}
