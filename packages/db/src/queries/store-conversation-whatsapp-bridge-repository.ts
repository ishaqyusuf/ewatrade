// Implementation stays behind the explicit Store Conversation bridge seam.
import type {
  StoreConversationWhatsAppBridgeChoice as SharedBridgeChoice,
  StoreConversationWhatsAppBridgeIssueProjection,
} from "@ewatrade/service-commerce"
import {
  STORE_CONVERSATION_WHATSAPP_BRIDGE_LIFETIME_MS,
  buildStoreConversationWhatsAppNavigationUrl,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  type StoreConversationGuestCredentialPurpose,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  StoreConversationRequestKind,
  StoreConversationWhatsAppBridgeAttemptStatus,
  StoreConversationWhatsAppBridgeAuditOutcome,
  StoreConversationWhatsAppBridgeAuditType,
  StoreConversationWhatsAppBridgeCapabilityStatus,
  StoreConversationWhatsAppBridgeChoice,
  StoreConversationWhatsAppBridgeChoiceCapabilityStatus,
  StoreConversationWhatsAppBridgePrincipalKind,
  StoreConversationWhatsAppBridgeStatus,
  WhatsAppBindingStatus,
  WhatsAppConnectionStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import { resolveStoreConversationChannelProjectionInTransaction } from "./store-conversation-channel-projection"
import { appendStoreConversationWhatsAppCustomerTextInTransaction } from "./store-conversation-whatsapp-message-repository"
import {
  StoreConversationError,
  loadStoreConversationForGuest,
  loadStoreConversationRequestSummaries,
  lockStoreConversation,
  projectStoreConversationMessage,
  resolveStoreConversationEntry,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"
import type { DbClient } from "./types"

export type StoreConversationWhatsAppBridgeErrorCode =
  | "CONFLICT"
  | "EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_READY"

export class StoreConversationWhatsAppBridgeError extends Error {
  constructor(
    readonly code: StoreConversationWhatsAppBridgeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationWhatsAppBridgeError"
  }
}

type BridgePrincipal =
  | {
      accountUserId: string
      kind: "account"
    }
  | {
      credentialToken: string
      installationToken?: string
      kind: "guest"
      purpose: StoreConversationGuestCredentialPurpose
    }

type AuthorizedPrincipal =
  | {
      accountAccessId: string
      accountUserId: string
      guestIdentityId: null
      kind: "account"
    }
  | {
      accountAccessId: null
      accountUserId: null
      guestIdentityId: string
      kind: "guest"
    }

type BridgeTokenServices = {
  deriveChoiceToken: (input: {
    bridgeId: string
    choice: SharedBridgeChoice
    revision: number
  }) => string
  digestToken: (value: string) => string
}

const bridgeChoices = {
  continue_current_request:
    StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST,
  start_new_request: StoreConversationWhatsAppBridgeChoice.START_NEW_REQUEST,
} satisfies Record<SharedBridgeChoice, StoreConversationWhatsAppBridgeChoice>

function assertDigest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new StoreConversationWhatsAppBridgeError(
      "FORBIDDEN",
      "This WhatsApp continuation is unavailable.",
    )
  }
}

async function appendBridgeWhatsAppCustomerText(
  ...args: Parameters<
    typeof appendStoreConversationWhatsAppCustomerTextInTransaction
  >
) {
  try {
    return await appendStoreConversationWhatsAppCustomerTextInTransaction(
      ...args,
    )
  } catch (error) {
    if (!(error instanceof Error)) throw error
    if (error.message === "WHATSAPP_MESSAGE_IDEMPOTENCY_MISMATCH") {
      throw new StoreConversationWhatsAppBridgeError(
        "CONFLICT",
        "This WhatsApp message does not match its earlier delivery.",
      )
    }
    if (
      error.message === "WHATSAPP_MESSAGE_SOURCE_CHANGED" ||
      error.message === "WHATSAPP_CONVERSATION_CHANGED"
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "CONFLICT",
        "That request changed. Start again from the EwaTrade chat.",
      )
    }
    if (error.message === "WHATSAPP_CONVERSATION_NOT_READY") {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "This Store conversation cannot continue on WhatsApp right now.",
      )
    }
    throw error
  }
}

async function authorizeBridgePrincipal(
  db: DbClient,
  input: {
    conversationId: string
    now: Date
    principal: BridgePrincipal
  },
) {
  if (input.principal.kind === "guest") {
    const { conversation, credential } = await loadStoreConversationForGuest(
      db,
      {
        conversationId: input.conversationId,
        credentialToken: input.principal.credentialToken,
        installationToken: input.principal.installationToken,
        now: input.now,
        purpose: input.principal.purpose,
        touchCredential: false,
      },
    )
    return {
      conversation,
      principal: {
        accountAccessId: null,
        accountUserId: null,
        guestIdentityId: credential.guestIdentityId,
        kind: "guest",
      } satisfies AuthorizedPrincipal,
    }
  }
  const [account, access] = await Promise.all([
    db.user.findUnique({
      select: { id: true },
      where: { id: input.principal.accountUserId },
    }),
    db.storeConversationAccountAccess.findFirst({
      include: { conversation: { include: { store: true } } },
      where: {
        accountUserId: input.principal.accountUserId,
        conversationId: input.conversationId,
        status: "ACTIVE",
      },
    }),
  ])
  if (!account || !access) {
    throw new StoreConversationWhatsAppBridgeError(
      "NOT_FOUND",
      "This Store conversation is unavailable.",
    )
  }
  return {
    conversation: access.conversation,
    principal: {
      accountAccessId: access.id,
      accountUserId: account.id,
      guestIdentityId: null,
      kind: "account",
    } satisfies AuthorizedPrincipal,
  }
}

function assertConversationCurrent(conversation: {
  lifecycle: StoreConversationLifecycle
  moderationState: StoreConversationModerationState
}) {
  if (
    conversation.lifecycle !== StoreConversationLifecycle.ACTIVE ||
    conversation.moderationState !== StoreConversationModerationState.OPEN
  ) {
    throw new StoreConversationWhatsAppBridgeError(
      "NOT_READY",
      "This Store conversation cannot continue on WhatsApp right now.",
    )
  }
}

export async function resolveCurrentWhatsAppBinding(
  db: DbClient,
  input: { storeId: string; tenantId: string },
) {
  const projection =
    await resolveStoreConversationChannelProjectionInTransaction(db, input)
  if (!projection?.channelMode.whatsappAction) {
    throw new StoreConversationWhatsAppBridgeError(
      "NOT_READY",
      "WhatsApp is unavailable for this Store right now.",
    )
  }
  const bindings = await db.whatsAppStoreBinding.findMany({
    select: {
      connection: {
        select: {
          businessVerified: true,
          credentialReference: true,
          displayNumber: true,
          id: true,
          numberVerified: true,
          outboundVerified: true,
          phoneNumberId: true,
          status: true,
          templatesReady: true,
          tenantId: true,
          webhookSubscribed: true,
        },
      },
      connectionId: true,
      status: true,
      tenantId: true,
    },
    take: 2,
    where: {
      connection: {
        status: WhatsAppConnectionStatus.ACTIVE,
        tenantId: input.tenantId,
      },
      status: WhatsAppBindingStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const binding = bindings.length === 1 ? bindings[0] : null
  if (
    !binding ||
    binding.tenantId !== input.tenantId ||
    binding.connection.tenantId !== input.tenantId ||
    binding.connection.status !== WhatsAppConnectionStatus.ACTIVE ||
    !binding.connection.businessVerified ||
    !binding.connection.numberVerified ||
    !binding.connection.webhookSubscribed ||
    !binding.connection.outboundVerified ||
    !binding.connection.templatesReady
  ) {
    throw new StoreConversationWhatsAppBridgeError(
      "NOT_READY",
      "WhatsApp routing is unavailable for this Store right now.",
    )
  }
  return binding.connection
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

async function currentSingleActiveSource(
  db: DbClient,
  input: { conversationId: string; storeId: string; tenantId: string },
) {
  const active = (
    await loadStoreConversationRequestSummaries(db, input)
  ).filter((summary) => summary.lifecycle === "active")
  const source = active.length === 1 ? active[0] : null
  return source
    ? {
        sourceId: source.id,
        sourceKind: projectSourceKind(source.kind),
        sourceRevision: source.revision,
      }
    : { sourceId: null, sourceKind: null, sourceRevision: null }
}

function auditPrincipal(principal: AuthorizedPrincipal) {
  return {
    accountUserId: principal.accountUserId,
    guestIdentityId: principal.guestIdentityId,
    principalKind:
      principal.kind === "account"
        ? StoreConversationWhatsAppBridgePrincipalKind.ACCOUNT
        : StoreConversationWhatsAppBridgePrincipalKind.GUEST_IDENTITY,
  }
}

export async function issueStoreConversationWhatsAppBridge(
  db: PrismaClient,
  input: {
    bridgeTokenDigest: string
    clientOperationId: string
    conversationId: string
    now?: Date
    principal: BridgePrincipal
    publicToken: string
  },
) {
  assertDigest(input.bridgeTokenDigest)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const authorized = await authorizeBridgePrincipal(tx, {
      conversationId: input.conversationId,
      now,
      principal: input.principal,
    })
    assertConversationCurrent(authorized.conversation)
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    if (
      authorized.conversation.storeId !== entry.storeId ||
      authorized.conversation.tenantId !== entry.tenantId
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    const connection = await resolveCurrentWhatsAppBinding(tx, entry)
    const source = await currentSingleActiveSource(tx, {
      conversationId: input.conversationId,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const payloadHash = storeConversationPayloadHash({
      accountAccessId: authorized.principal.accountAccessId,
      bridgeTokenDigest: input.bridgeTokenDigest,
      connectionId: connection.id,
      conversationId: input.conversationId,
      guestIdentityId: authorized.principal.guestIdentityId,
      intent: "continue_or_new",
      publicEntryPointId: entry.entryPointId,
      source,
    })
    const replay =
      await tx.storeConversationWhatsAppBridgeCapability.findUnique({
        where: {
          conversationId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            conversationId: input.conversationId,
          },
        },
      })
    if (replay) {
      if (
        replay.payloadHash !== payloadHash ||
        replay.tokenDigest !== input.bridgeTokenDigest
      ) {
        throw new StoreConversationWhatsAppBridgeError(
          "CONFLICT",
          "This WhatsApp continuation was already started with different details.",
        )
      }
      if (
        replay.status !==
          StoreConversationWhatsAppBridgeCapabilityStatus.PENDING ||
        replay.expiresAt <= now
      ) {
        throw new StoreConversationWhatsAppBridgeError(
          "EXPIRED",
          "This WhatsApp continuation is no longer available. Start again from the chat.",
        )
      }
      return {
        capabilityId: replay.id,
        connectionId: replay.connectionId,
        displayNumber: connection.displayNumber,
        expiresAt: replay.expiresAt,
        replayed: true,
      }
    }

    const expiresAt = new Date(
      now.getTime() + STORE_CONVERSATION_WHATSAPP_BRIDGE_LIFETIME_MS,
    )
    const capability =
      await tx.storeConversationWhatsAppBridgeCapability.create({
        data: {
          accountAccessId: authorized.principal.accountAccessId,
          clientOperationId: input.clientOperationId,
          connectionId: connection.id,
          conversationId: input.conversationId,
          expiresAt,
          guestIdentityId: authorized.principal.guestIdentityId,
          payloadHash,
          sourceId: source.sourceId,
          sourceKind: source.sourceKind,
          sourceRevision: source.sourceRevision,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
          tokenDigest: input.bridgeTokenDigest,
        },
      })
    await tx.storeConversationWhatsAppBridgeAuditEvent.create({
      data: {
        ...auditPrincipal(authorized.principal),
        capabilityId: capability.id,
        conversationId: input.conversationId,
        outcome: StoreConversationWhatsAppBridgeAuditOutcome.ALLOWED,
        reasonCode: "navigation_issued",
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        type: StoreConversationWhatsAppBridgeAuditType.NAVIGATION_ISSUED,
      },
    })
    return {
      capabilityId: capability.id,
      connectionId: connection.id,
      displayNumber: connection.displayNumber,
      expiresAt,
      replayed: false,
    }
  })
}

async function assertCapabilityPrincipalCurrent(
  db: DbClient,
  capability: {
    accountAccessId: string | null
    candidateId?: string | null
    capabilityId?: string | null
    conversationId: string
    guestIdentityId: string | null
    storeId: string
    tenantId: string
  },
) {
  if (
    ("capabilityId" in capability || "candidateId" in capability) &&
    Boolean(capability.capabilityId) === Boolean(capability.candidateId)
  ) {
    throw new StoreConversationWhatsAppBridgeError(
      "CONFLICT",
      "This WhatsApp continuation has an invalid authorization proof.",
    )
  }
  const [guestAccess, accountAccess] = await Promise.all([
    capability.guestIdentityId
      ? db.storeConversation.findFirst({
          select: { id: true },
          where: {
            id: capability.conversationId,
            OR: [
              { guestIdentityId: capability.guestIdentityId },
              {
                guestAccesses: {
                  some: {
                    guestIdentityId: capability.guestIdentityId,
                    status: "ACTIVE",
                  },
                },
              },
            ],
            storeId: capability.storeId,
            tenantId: capability.tenantId,
          },
        })
      : null,
    capability.accountAccessId
      ? db.storeConversationAccountAccess.findFirst({
          select: { accountUserId: true, id: true },
          where: {
            conversationId: capability.conversationId,
            id: capability.accountAccessId,
            status: "ACTIVE",
            storeId: capability.storeId,
            tenantId: capability.tenantId,
          },
        })
      : null,
  ])
  if (
    (capability.guestIdentityId && !guestAccess) ||
    (capability.accountAccessId && !accountAccess) ||
    (!capability.guestIdentityId && !capability.accountAccessId)
  ) {
    throw new StoreConversationWhatsAppBridgeError(
      "FORBIDDEN",
      "This WhatsApp continuation is unavailable.",
    )
  }
  if (capability.accountAccessId && accountAccess) {
    return {
      accountAccessId: capability.accountAccessId,
      accountUserId: accountAccess.accountUserId,
      guestIdentityId: null,
      kind: "account",
    } satisfies AuthorizedPrincipal
  }
  if (capability.guestIdentityId && guestAccess) {
    return {
      accountAccessId: null,
      accountUserId: null,
      guestIdentityId: capability.guestIdentityId,
      kind: "guest",
    } satisfies AuthorizedPrincipal
  }
  throw new StoreConversationWhatsAppBridgeError(
    "FORBIDDEN",
    "This WhatsApp continuation is unavailable.",
  )
}

async function appendBridgeSystemMessage(
  tx: Prisma.TransactionClient,
  input: {
    body: string
    conversationId: string
    now: Date
    storeId: string
    tenantId: string
  },
) {
  await lockStoreConversation(tx, input)
  const conversation = await tx.storeConversation.findFirst({
    select: { lastMessageSequence: true },
    where: {
      id: input.conversationId,
      lifecycle: StoreConversationLifecycle.ACTIVE,
      moderationState: StoreConversationModerationState.OPEN,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!conversation) {
    throw new StoreConversationWhatsAppBridgeError(
      "NOT_READY",
      "This Store conversation cannot continue on WhatsApp right now.",
    )
  }
  const sequence = conversation.lastMessageSequence + 1
  const updated = await tx.storeConversation.updateMany({
    data: { lastActivityAt: input.now, lastMessageSequence: sequence },
    where: {
      id: input.conversationId,
      lastMessageSequence: conversation.lastMessageSequence,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (updated.count !== 1) {
    throw new StoreConversationWhatsAppBridgeError(
      "CONFLICT",
      "This conversation changed. Refresh and try again.",
    )
  }
  return tx.storeConversationMessage.create({
    data: {
      authorKind: StoreConversationMessageAuthorKind.SYSTEM,
      body: input.body,
      channel: StoreConversationMessageChannel.WHATSAPP,
      conversationId: input.conversationId,
      kind: StoreConversationMessageKind.SYSTEM_EVENT,
      occurredAt: input.now,
      sequence,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function consumeStoreConversationWhatsAppBridge(
  db: PrismaClient,
  input: {
    bridgeTokenDigest: string
    connectionId: string
    externalCustomerIdCiphertext: string
    externalCustomerIdDigest: string
    now?: Date
    tokenServices: BridgeTokenServices
  },
) {
  assertDigest(input.bridgeTokenDigest)
  assertDigest(input.externalCustomerIdDigest)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const capability =
      await tx.storeConversationWhatsAppBridgeCapability.findUnique({
        where: { tokenDigest: input.bridgeTokenDigest },
      })
    if (!capability) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_FOUND",
        "This WhatsApp continuation is unavailable.",
      )
    }
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppBridgeCapability"
      WHERE "id" = ${capability.id}
      FOR UPDATE
    `)
    const current =
      await tx.storeConversationWhatsAppBridgeCapability.findUnique({
        where: { id: capability.id },
      })
    if (
      !current ||
      current.status !==
        StoreConversationWhatsAppBridgeCapabilityStatus.PENDING ||
      current.expiresAt <= now
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "EXPIRED",
        "This WhatsApp continuation is no longer available. Start again from the chat.",
      )
    }
    if (current.connectionId !== input.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "FORBIDDEN",
        "This WhatsApp continuation is unavailable.",
      )
    }
    const principal = await assertCapabilityPrincipalCurrent(tx, current)
    const connection = await resolveCurrentWhatsAppBinding(tx, current)
    if (connection.id !== current.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the EwaTrade chat.",
      )
    }
    const activeSource = await currentSingleActiveSource(tx, current)
    const continuationStillCurrent =
      current.sourceKind !== null &&
      current.sourceId !== null &&
      current.sourceRevision !== null &&
      activeSource.sourceKind === current.sourceKind &&
      activeSource.sourceId === current.sourceId &&
      activeSource.sourceRevision === current.sourceRevision
    const message = await appendBridgeSystemMessage(tx, {
      body: "WhatsApp connected. Choose how you want to continue.",
      conversationId: current.conversationId,
      now,
      storeId: current.storeId,
      tenantId: current.tenantId,
    })
    const currentRouteWhere = {
      connectionId: current.connectionId,
      externalCustomerIdDigest: input.externalCustomerIdDigest,
      status: {
        in: [
          StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE,
          StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND,
          StoreConversationWhatsAppBridgeStatus.ACTIVE,
        ],
      },
      tenantId: current.tenantId,
    }
    await tx.storeConversationWhatsAppBridgeChoiceCapability.updateMany({
      data: {
        revokedAt: now,
        status: StoreConversationWhatsAppBridgeChoiceCapabilityStatus.REVOKED,
      },
      where: {
        bridge: currentRouteWhere,
        status: StoreConversationWhatsAppBridgeChoiceCapabilityStatus.ACTIVE,
      },
    })
    await tx.storeConversationWhatsAppBridgeAttempt.updateMany({
      data: {
        claimExpiresAt: null,
        claimToken: null,
        failureCode: "bridge_superseded",
        nextAttemptAt: null,
        status: StoreConversationWhatsAppBridgeAttemptStatus.CANCELLED,
      },
      where: {
        bridge: currentRouteWhere,
        status: {
          in: [
            StoreConversationWhatsAppBridgeAttemptStatus.PENDING,
            StoreConversationWhatsAppBridgeAttemptStatus.CLAIMED,
            StoreConversationWhatsAppBridgeAttemptStatus.FAILED,
          ],
        },
      },
    })
    const superseded = await tx.storeConversationWhatsAppBridge.updateMany({
      data: {
        revokedAt: now,
        status: StoreConversationWhatsAppBridgeStatus.REVOKED,
      },
      where: currentRouteWhere,
    })
    if (superseded.count > 0) {
      await tx.storeConversationWhatsAppBridgeAuditEvent.create({
        data: {
          accountUserId: null,
          bridgeId: null,
          capabilityId: current.id,
          conversationId: current.conversationId,
          guestIdentityId: null,
          outcome: StoreConversationWhatsAppBridgeAuditOutcome.ALLOWED,
          principalKind: StoreConversationWhatsAppBridgePrincipalKind.SYSTEM,
          reasonCode: "new_verified_bridge_superseded_route",
          storeId: current.storeId,
          tenantId: current.tenantId,
          type: StoreConversationWhatsAppBridgeAuditType.REVOKED,
        },
      })
    }
    const bridge = await tx.storeConversationWhatsAppBridge.upsert({
      create: {
        accountAccessId: principal.accountAccessId,
        capabilityId: current.id,
        connectionId: current.connectionId,
        conversationId: current.conversationId,
        externalCustomerIdCiphertext: input.externalCustomerIdCiphertext,
        externalCustomerIdDigest: input.externalCustomerIdDigest,
        guestIdentityId: principal.guestIdentityId,
        linkedMessageId: message.id,
        sourceId: continuationStillCurrent ? current.sourceId : null,
        sourceKind: continuationStillCurrent ? current.sourceKind : null,
        sourceRevision: continuationStillCurrent
          ? current.sourceRevision
          : null,
        storeId: current.storeId,
        tenantId: current.tenantId,
      },
      update: {
        accountAccessId: principal.accountAccessId,
        capabilityId: current.id,
        candidateId: null,
        choice: null,
        choiceAt: null,
        conversationId: current.conversationId,
        externalCustomerIdCiphertext: input.externalCustomerIdCiphertext,
        guestIdentityId: principal.guestIdentityId,
        linkedAt: now,
        linkedMessageId: message.id,
        revision: { increment: 1 },
        revokedAt: null,
        sourceId: continuationStillCurrent ? current.sourceId : null,
        sourceKind: continuationStillCurrent ? current.sourceKind : null,
        sourceRevision: continuationStillCurrent
          ? current.sourceRevision
          : null,
        status: StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE,
      },
      where: {
        storeId_connectionId_externalCustomerIdDigest: {
          connectionId: current.connectionId,
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          storeId: current.storeId,
        },
      },
    })
    const choices: SharedBridgeChoice[] = ["start_new_request"]
    if (continuationStillCurrent) choices.unshift("continue_current_request")
    for (const choice of choices) {
      const rawToken = input.tokenServices.deriveChoiceToken({
        bridgeId: bridge.id,
        choice,
        revision: bridge.revision,
      })
      const tokenDigest = input.tokenServices.digestToken(rawToken)
      assertDigest(tokenDigest)
      await tx.storeConversationWhatsAppBridgeChoiceCapability.create({
        data: {
          bridgeId: bridge.id,
          bridgeRevision: bridge.revision,
          choice: bridgeChoices[choice],
          expiresAt: new Date(
            now.getTime() + STORE_CONVERSATION_WHATSAPP_BRIDGE_LIFETIME_MS,
          ),
          storeId: current.storeId,
          tenantId: current.tenantId,
          tokenDigest,
        },
      })
    }
    await tx.storeConversationWhatsAppBridgeAttempt.create({
      data: {
        bridgeId: bridge.id,
        bridgeRevision: bridge.revision,
        connectionId: bridge.connectionId,
        storeId: bridge.storeId,
        tenantId: bridge.tenantId,
      },
    })
    await tx.storeConversationWhatsAppBridgeCapability.update({
      data: {
        consumedAt: now,
        status: StoreConversationWhatsAppBridgeCapabilityStatus.CONSUMED,
      },
      where: { id: current.id },
    })
    await tx.storeConversationWhatsAppBridgeAuditEvent.create({
      data: {
        ...auditPrincipal(principal),
        bridgeId: bridge.id,
        capabilityId: current.id,
        conversationId: current.conversationId,
        outcome: StoreConversationWhatsAppBridgeAuditOutcome.ALLOWED,
        reasonCode: "signed_inbound_code_consumed",
        storeId: current.storeId,
        tenantId: current.tenantId,
        type: StoreConversationWhatsAppBridgeAuditType.LINKED,
      },
    })
    return {
      bridgeId: bridge.id,
      choices,
      conversationId: bridge.conversationId,
      revision: bridge.revision,
      storeId: bridge.storeId,
      tenantId: bridge.tenantId,
    }
  })
}

export async function selectStoreConversationWhatsAppBridgeChoice(
  db: PrismaClient,
  input: {
    choiceTokenDigest: string
    connectionId: string
    externalCustomerIdDigest: string
    now?: Date
  },
) {
  assertDigest(input.choiceTokenDigest)
  assertDigest(input.externalCustomerIdDigest)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const capability =
      await tx.storeConversationWhatsAppBridgeChoiceCapability.findUnique({
        include: { bridge: true },
        where: { tokenDigest: input.choiceTokenDigest },
      })
    if (!capability) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_FOUND",
        "This WhatsApp choice is unavailable.",
      )
    }
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppBridgeChoiceCapability"
      WHERE "id" = ${capability.id}
      FOR UPDATE
    `)
    const current =
      await tx.storeConversationWhatsAppBridgeChoiceCapability.findUnique({
        include: { bridge: true },
        where: { id: capability.id },
      })
    if (
      !current ||
      current.status !==
        StoreConversationWhatsAppBridgeChoiceCapabilityStatus.ACTIVE ||
      current.expiresAt <= now ||
      current.bridge.status !==
        StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE ||
      current.bridge.revision !== current.bridgeRevision
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "EXPIRED",
        "This WhatsApp choice is no longer available.",
      )
    }
    if (
      current.bridge.connectionId !== input.connectionId ||
      current.bridge.externalCustomerIdDigest !== input.externalCustomerIdDigest
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "FORBIDDEN",
        "This WhatsApp choice is unavailable.",
      )
    }
    const principal = await assertCapabilityPrincipalCurrent(tx, {
      accountAccessId: current.bridge.accountAccessId,
      conversationId: current.bridge.conversationId,
      guestIdentityId: current.bridge.guestIdentityId,
      storeId: current.bridge.storeId,
      tenantId: current.bridge.tenantId,
    })
    const connection = await resolveCurrentWhatsAppBinding(tx, current.bridge)
    if (connection.id !== current.bridge.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the EwaTrade chat.",
      )
    }
    let source = {
      sourceId: null as string | null,
      sourceKind: null as StoreConversationRequestKind | null,
      sourceRevision: null as number | null,
    }
    if (
      current.choice ===
      StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST
    ) {
      const active = await currentSingleActiveSource(tx, current.bridge)
      if (
        !current.bridge.sourceId ||
        !current.bridge.sourceKind ||
        current.bridge.sourceRevision === null ||
        active.sourceId !== current.bridge.sourceId ||
        active.sourceKind !== current.bridge.sourceKind ||
        active.sourceRevision !== current.bridge.sourceRevision
      ) {
        throw new StoreConversationWhatsAppBridgeError(
          "CONFLICT",
          "That request changed. Choose Start a new request instead.",
        )
      }
      source = active
    }
    const awaitingRequestKind =
      current.choice === StoreConversationWhatsAppBridgeChoice.START_NEW_REQUEST
    const bridge = await tx.storeConversationWhatsAppBridge.update({
      data: {
        choice: current.choice,
        choiceAt: now,
        ...(awaitingRequestKind ? { revision: { increment: 1 } } : {}),
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceRevision: source.sourceRevision,
        status: awaitingRequestKind
          ? StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND
          : StoreConversationWhatsAppBridgeStatus.ACTIVE,
      },
      where: { id: current.bridge.id },
    })
    await tx.storeConversationWhatsAppBridgeChoiceCapability.update({
      data: {
        consumedAt: now,
        status: StoreConversationWhatsAppBridgeChoiceCapabilityStatus.CONSUMED,
      },
      where: { id: current.id },
    })
    await tx.storeConversationWhatsAppBridgeChoiceCapability.updateMany({
      data: {
        revokedAt: now,
        status: StoreConversationWhatsAppBridgeChoiceCapabilityStatus.REVOKED,
      },
      where: {
        bridgeId: bridge.id,
        id: { not: current.id },
        status: StoreConversationWhatsAppBridgeChoiceCapabilityStatus.ACTIVE,
      },
    })
    if (awaitingRequestKind) {
      await tx.storeConversationWhatsAppBridgeAttempt.create({
        data: {
          bridgeId: bridge.id,
          bridgeRevision: bridge.revision,
          connectionId: bridge.connectionId,
          storeId: bridge.storeId,
          tenantId: bridge.tenantId,
        },
      })
    }
    await appendBridgeSystemMessage(tx, {
      body:
        current.choice ===
        StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST
          ? "Continue where I stopped selected in WhatsApp."
          : "Start a new request selected in WhatsApp.",
      conversationId: bridge.conversationId,
      now,
      storeId: bridge.storeId,
      tenantId: bridge.tenantId,
    })
    await tx.storeConversationWhatsAppBridgeAuditEvent.create({
      data: {
        ...auditPrincipal(principal),
        bridgeId: bridge.id,
        capabilityId: bridge.capabilityId,
        conversationId: bridge.conversationId,
        outcome: StoreConversationWhatsAppBridgeAuditOutcome.ALLOWED,
        reasonCode:
          current.choice ===
          StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST
            ? "continue_current_request"
            : "start_new_request",
        storeId: bridge.storeId,
        tenantId: bridge.tenantId,
        type: StoreConversationWhatsAppBridgeAuditType.CHOICE_SELECTED,
      },
    })
    return {
      bridgeId: bridge.id,
      choice:
        current.choice ===
        StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST
          ? ("continue_current_request" as const)
          : ("start_new_request" as const),
      conversationId: bridge.conversationId,
      promptRequired: awaitingRequestKind,
      source,
      storeId: bridge.storeId,
      tenantId: bridge.tenantId,
    }
  })
}

async function findCurrentBridgeForRecipient(
  db: DbClient,
  input: { connectionId: string; externalCustomerIdDigest: string },
) {
  const bridges = await db.storeConversationWhatsAppBridge.findMany({
    orderBy: { updatedAt: "desc" },
    take: 2,
    where: {
      connectionId: input.connectionId,
      externalCustomerIdDigest: input.externalCustomerIdDigest,
      status: {
        in: [
          StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE,
          StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND,
          StoreConversationWhatsAppBridgeStatus.ACTIVE,
        ],
      },
    },
  })
  if (bridges.length > 1) {
    throw new StoreConversationWhatsAppBridgeError(
      "CONFLICT",
      "More than one current WhatsApp conversation matches this Store route.",
    )
  }
  return bridges[0] ?? null
}

export async function resolveStoreConversationWhatsAppBridgeInboundRoute(
  db: PrismaClient,
  input: { connectionId: string; externalCustomerIdDigest: string },
) {
  assertDigest(input.externalCustomerIdDigest)
  return runStoreConversationActionTransaction(db, async (tx) => {
    const bridge = await findCurrentBridgeForRecipient(tx, input)
    if (!bridge) return null
    await assertCapabilityPrincipalCurrent(tx, bridge)
    const connection = await resolveCurrentWhatsAppBinding(tx, bridge)
    if (connection.id !== bridge.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the EwaTrade chat.",
      )
    }
    const effectiveChoice =
      bridge.status === StoreConversationWhatsAppBridgeStatus.ACTIVE &&
      bridge.sourceId &&
      bridge.sourceKind &&
      bridge.sourceRevision !== null
        ? ("continue_current_request" as const)
        : bridge.choice ===
            StoreConversationWhatsAppBridgeChoice.START_NEW_REQUEST
          ? ("start_new_request" as const)
          : bridge.choice ===
              StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST
            ? ("continue_current_request" as const)
            : null
    return {
      bridgeId: bridge.id,
      choice: effectiveChoice,
      conversationId: bridge.conversationId,
      source: {
        sourceId: bridge.sourceId,
        sourceKind: bridge.sourceKind,
        sourceRevision: bridge.sourceRevision,
      },
      state:
        bridge.status === StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE
          ? ("awaiting_choice" as const)
          : bridge.status ===
              StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND
            ? ("awaiting_request_kind" as const)
            : ("active" as const),
      storeId: bridge.storeId,
      tenantId: bridge.tenantId,
    }
  })
}

export async function selectStoreConversationWhatsAppBridgeRequestKind(
  db: PrismaClient,
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    now?: Date
    requestKind: "commerce_inquiry"
  },
) {
  assertDigest(input.externalCustomerIdDigest)
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const bridge = await findCurrentBridgeForRecipient(tx, input)
    if (!bridge) return null
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppBridge"
      WHERE "id" = ${bridge.id}
      FOR UPDATE
    `)
    const current = await tx.storeConversationWhatsAppBridge.findUnique({
      where: { id: bridge.id },
    })
    if (
      !current ||
      current.connectionId !== input.connectionId ||
      current.externalCustomerIdDigest !== input.externalCustomerIdDigest ||
      current.status !==
        StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND ||
      current.choice !== StoreConversationWhatsAppBridgeChoice.START_NEW_REQUEST
    ) {
      return null
    }
    const principal = await assertCapabilityPrincipalCurrent(tx, current)
    const connection = await resolveCurrentWhatsAppBinding(tx, current)
    if (connection.id !== current.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the EwaTrade chat.",
      )
    }
    const activated = await tx.storeConversationWhatsAppBridge.update({
      data: {
        revision: { increment: 1 },
        status: StoreConversationWhatsAppBridgeStatus.ACTIVE,
      },
      where: { id: current.id },
    })
    await appendBridgeSystemMessage(tx, {
      body: "Product request selected in WhatsApp.",
      conversationId: current.conversationId,
      now,
      storeId: current.storeId,
      tenantId: current.tenantId,
    })
    await tx.storeConversationWhatsAppBridgeAuditEvent.create({
      data: {
        ...auditPrincipal(principal),
        bridgeId: current.id,
        capabilityId: current.capabilityId,
        conversationId: current.conversationId,
        outcome: StoreConversationWhatsAppBridgeAuditOutcome.ALLOWED,
        reasonCode: `new_${input.requestKind}`,
        storeId: current.storeId,
        tenantId: current.tenantId,
        type: StoreConversationWhatsAppBridgeAuditType.CHOICE_SELECTED,
      },
    })
    return {
      bridgeId: activated.id,
      conversationId: activated.conversationId,
      requestKind: input.requestKind,
      storeId: activated.storeId,
      tenantId: activated.tenantId,
    }
  })
}

export async function bindStoreConversationWhatsAppBridgeNewRequest(
  db: PrismaClient,
  input: {
    bridgeId: string
    connectionId: string
    externalCustomerIdDigest: string
    now?: Date
    providerEventDigest: string
    sourceId: string
    sourceKind: StoreConversationRequestKind
    storeId: string
    tenantId: string
    text: string
  },
) {
  assertDigest(input.externalCustomerIdDigest)
  assertDigest(input.providerEventDigest)
  const text = input.text.trim()
  if (!text || text.length > 2_000) {
    throw new StoreConversationWhatsAppBridgeError(
      "CONFLICT",
      "This WhatsApp message cannot be added to the conversation.",
    )
  }
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppBridge"
      WHERE "id" = ${input.bridgeId}
      FOR UPDATE
    `)
    const bridge = await tx.storeConversationWhatsAppBridge.findFirst({
      where: {
        connectionId: input.connectionId,
        externalCustomerIdDigest: input.externalCustomerIdDigest,
        id: input.bridgeId,
        status: StoreConversationWhatsAppBridgeStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !bridge ||
      bridge.choice !== StoreConversationWhatsAppBridgeChoice.START_NEW_REQUEST
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "CONFLICT",
        "This WhatsApp request is no longer waiting to be connected.",
      )
    }
    if (
      bridge.sourceId &&
      (bridge.sourceId !== input.sourceId ||
        bridge.sourceKind !== input.sourceKind)
    ) {
      throw new StoreConversationWhatsAppBridgeError(
        "CONFLICT",
        "This WhatsApp request does not match the selected conversation.",
      )
    }
    const principal = await assertCapabilityPrincipalCurrent(tx, bridge)
    const connection = await resolveCurrentWhatsAppBinding(tx, bridge)
    if (connection.id !== bridge.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the EwaTrade chat.",
      )
    }
    const sourceRevision =
      bridge.sourceId === input.sourceId &&
      bridge.sourceKind === input.sourceKind &&
      bridge.sourceRevision !== null
        ? bridge.sourceRevision
        : await resolveCurrentStoreConversationRequestRevision(tx, {
            kind: input.sourceKind,
            sourceId: input.sourceId,
            storeId: bridge.storeId,
            tenantId: bridge.tenantId,
          })
    const result =
      await appendBridgeWhatsAppCustomerText(tx, {
        auditReasonCode:
          principal.kind === "account"
            ? "whatsapp_bridge_account_message"
            : "whatsapp_bridge_guest_message",
        now,
        providerEventDigest: input.providerEventDigest,
        route: bridge,
        source: {
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          sourceRevision,
        },
        text,
      })
    if (!result.replayed) {
      await tx.storeConversationWhatsAppBridge.update({
        data: {
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          sourceRevision,
        },
        where: { id: bridge.id },
      })
    }
    return result
  })
}

/// Persists only supported text on an already explicit, current continuation.
/// The signed provider event id reaches this boundary only as a keyed digest.
export async function appendStoreConversationWhatsAppBridgeText(
  db: PrismaClient,
  input: {
    connectionId: string
    externalCustomerIdDigest: string
    now?: Date
    providerEventDigest: string
    storeId: string
    tenantId: string
    text: string
  },
) {
  assertDigest(input.externalCustomerIdDigest)
  assertDigest(input.providerEventDigest)
  const text = input.text.trim()
  if (!text || text.length > 2_000) return null
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const bridge = await tx.storeConversationWhatsAppBridge.findUnique({
      where: {
        storeId_connectionId_externalCustomerIdDigest: {
          connectionId: input.connectionId,
          externalCustomerIdDigest: input.externalCustomerIdDigest,
          storeId: input.storeId,
        },
      },
    })
    if (
      !bridge ||
      bridge.tenantId !== input.tenantId ||
      bridge.status !== StoreConversationWhatsAppBridgeStatus.ACTIVE ||
      !bridge.sourceId ||
      !bridge.sourceKind ||
      bridge.sourceRevision === null
    ) {
      return null
    }
    const principal = await assertCapabilityPrincipalCurrent(tx, bridge)
    const connection = await resolveCurrentWhatsAppBinding(tx, bridge)
    if (connection.id !== bridge.connectionId) {
      throw new StoreConversationWhatsAppBridgeError(
        "NOT_READY",
        "WhatsApp routing changed. Start again from the EwaTrade chat.",
      )
    }
    return appendBridgeWhatsAppCustomerText(tx, {
      auditReasonCode:
        principal.kind === "account"
          ? "whatsapp_bridge_account_message"
          : "whatsapp_bridge_guest_message",
      now,
      providerEventDigest: input.providerEventDigest,
      route: bridge,
      source: {
        sourceId: bridge.sourceId,
        sourceKind: bridge.sourceKind,
        sourceRevision: bridge.sourceRevision,
      },
      text,
    })
  })
}

export async function listDueStoreConversationWhatsAppBridgePrompts(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100)
  const attempts = await db.storeConversationWhatsAppBridgeAttempt.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { bridgeId: true, storeId: true, tenantId: true },
    take: limit,
    where: {
      attemptCount: { lt: 3 },
      bridge: {
        status: {
          in: [
            StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE,
            StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND,
          ],
        },
      },
      OR: [
        { status: StoreConversationWhatsAppBridgeAttemptStatus.PENDING },
        {
          nextAttemptAt: { lte: now },
          status: StoreConversationWhatsAppBridgeAttemptStatus.FAILED,
        },
        {
          claimExpiresAt: { lte: now },
          status: StoreConversationWhatsAppBridgeAttemptStatus.CLAIMED,
        },
      ],
    },
  })
  return attempts
}

export async function claimStoreConversationWhatsAppBridgePrompt(
  db: PrismaClient,
  input: {
    bridgeId: string
    claimToken: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  if (!input.claimToken.trim() || input.claimToken.length > 191) {
    throw new StoreConversationWhatsAppBridgeError(
      "FORBIDDEN",
      "This WhatsApp prompt is unavailable.",
    )
  }
  return runStoreConversationActionTransaction(db, async (tx) => {
    const bridge = await tx.storeConversationWhatsAppBridge.findFirst({
      select: { revision: true },
      where: {
        id: input.bridgeId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!bridge) return null
    const attempt = await tx.storeConversationWhatsAppBridgeAttempt.findUnique({
      include: {
        bridge: true,
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
        bridgeId_bridgeRevision: {
          bridgeId: input.bridgeId,
          bridgeRevision: bridge.revision,
        },
      },
    })
    if (!attempt) return null
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationWhatsAppBridgeAttempt"
      WHERE "id" = ${attempt.id}
      FOR UPDATE
    `)
    const current = await tx.storeConversationWhatsAppBridgeAttempt.findUnique({
      include: {
        bridge: true,
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
      (current.bridge.status !==
        StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE &&
        current.bridge.status !==
          StoreConversationWhatsAppBridgeStatus.AWAITING_REQUEST_KIND) ||
      current.bridge.revision !== current.bridgeRevision ||
      current.connection.status !== WhatsAppConnectionStatus.ACTIVE ||
      current.connection.tenantId !== current.tenantId ||
      current.attemptCount >= 3 ||
      (current.nextAttemptAt && current.nextAttemptAt > now) ||
      current.status === StoreConversationWhatsAppBridgeAttemptStatus.SENT ||
      current.status ===
        StoreConversationWhatsAppBridgeAttemptStatus.OUTCOME_UNKNOWN ||
      (current.status ===
        StoreConversationWhatsAppBridgeAttemptStatus.CLAIMED &&
        (!current.claimExpiresAt || current.claimExpiresAt > now))
    ) {
      return null
    }
    const connection = await resolveCurrentWhatsAppBinding(tx, current)
    if (connection.id !== current.connectionId) return null
    const claimed = await tx.storeConversationWhatsAppBridgeAttempt.updateMany({
      data: {
        attemptCount: { increment: 1 },
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + 60_000),
        claimToken: input.claimToken,
        failureCode: null,
        nextAttemptAt: null,
        status: StoreConversationWhatsAppBridgeAttemptStatus.CLAIMED,
      },
      where: {
        id: current.id,
        status: current.status,
        updatedAt: current.updatedAt,
      },
    })
    if (claimed.count !== 1) return null
    const awaitingBridgeChoice =
      current.bridge.status ===
      StoreConversationWhatsAppBridgeStatus.AWAITING_CHOICE
    const choiceCapabilities = awaitingBridgeChoice
      ? await tx.storeConversationWhatsAppBridgeChoiceCapability.findMany({
          orderBy: { choice: "asc" },
          select: { choice: true },
          take: 3,
          where: {
            bridgeId: current.bridgeId,
            bridgeRevision: current.bridgeRevision,
            expiresAt: { gt: now },
            status:
              StoreConversationWhatsAppBridgeChoiceCapabilityStatus.ACTIVE,
          },
        })
      : []
    if (awaitingBridgeChoice && choiceCapabilities.length === 0) {
      throw new StoreConversationWhatsAppBridgeError(
        "CONFLICT",
        "This WhatsApp prompt has no current choices.",
      )
    }
    const prompt = {
      attemptId: current.id,
      bridgeId: current.bridgeId,
      bridgeRevision: current.bridgeRevision,
      claimToken: input.claimToken,
      credentialReference: current.connection.credentialReference,
      externalCustomerIdCiphertext: current.bridge.externalCustomerIdCiphertext,
      phoneNumberId: current.connection.phoneNumberId,
    }
    if (awaitingBridgeChoice) {
      return {
        ...prompt,
        choices: choiceCapabilities.map((capability) =>
          capability.choice ===
          StoreConversationWhatsAppBridgeChoice.CONTINUE_CURRENT_REQUEST
            ? ("continue_current_request" as const)
            : ("start_new_request" as const),
        ),
        promptKind: "bridge_choice" as const,
      }
    }
    return {
      ...prompt,
      choices: ["commerce_inquiry"] as const,
      promptKind: "request_kind" as const,
    }
  })
}

export async function completeStoreConversationWhatsAppBridgePrompt(
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
  const updated = await db.storeConversationWhatsAppBridgeAttempt.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      providerReferenceDigest: input.providerReferenceDigest,
      sentAt: now,
      status: StoreConversationWhatsAppBridgeAttemptStatus.SENT,
    },
    where: {
      claimToken: input.claimToken,
      id: input.attemptId,
      status: StoreConversationWhatsAppBridgeAttemptStatus.CLAIMED,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (updated.count !== 1) {
    throw new StoreConversationWhatsAppBridgeError(
      "CONFLICT",
      "This WhatsApp prompt changed before delivery completed.",
    )
  }
  return { sent: true as const }
}

export async function failStoreConversationWhatsAppBridgePrompt(
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
  const updated = await db.storeConversationWhatsAppBridgeAttempt.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      failureCode: failureCode || "provider_send_failed",
      nextAttemptAt: input.outcomeUnknown
        ? null
        : new Date(now.getTime() + 30_000),
      status: input.outcomeUnknown
        ? StoreConversationWhatsAppBridgeAttemptStatus.OUTCOME_UNKNOWN
        : StoreConversationWhatsAppBridgeAttemptStatus.FAILED,
    },
    where: {
      claimToken: input.claimToken,
      id: input.attemptId,
      status: StoreConversationWhatsAppBridgeAttemptStatus.CLAIMED,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (updated.count !== 1) return null
  return {
    retryAt: input.outcomeUnknown ? null : new Date(now.getTime() + 30_000),
  }
}

export function projectStoreConversationWhatsAppBridgeIssue(input: {
  bridgeToken: string
  displayNumber: string
  expiresAt: Date
  replayed: boolean
}): StoreConversationWhatsAppBridgeIssueProjection {
  return {
    expiresAt: input.expiresAt,
    navigationUrl: buildStoreConversationWhatsAppNavigationUrl(input),
    replayed: input.replayed,
  }
}
