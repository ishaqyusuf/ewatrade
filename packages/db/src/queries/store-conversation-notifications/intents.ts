import {
  type StoreConversationNotificationChannel as SafeNotificationChannel,
  selectStoreConversationNotificationChannel,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  StoreConversationGuestCredentialStatus,
  StoreConversationGuestIdentityStatus,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  StoreConversationNotificationAttemptStatus,
  StoreConversationNotificationAuditType,
  StoreConversationNotificationChannel,
  StoreConversationNotificationContactChannel,
  StoreConversationNotificationContactStatus,
  StoreConversationNotificationIntentStatus,
  StoreConversationNotificationKind,
  StoreConversationNotificationPrincipalKind,
  StoreConversationNotificationReceiptStatus,
  StoreConversationPushEndpointKind,
  StoreConversationPushEndpointStatus,
} from "../../../generated/prisma/enums"
import {
  STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS,
  projectNotificationPreference,
} from "./shared"

const CLAIM_TTL_MS = 5 * 60_000

export type StoreConversationNotificationIdentifier = {
  intentId: string
  storeId: string
  tenantId: string
}

function databaseChannel(channel: SafeNotificationChannel) {
  if (channel === "email") return StoreConversationNotificationChannel.EMAIL
  if (channel === "whatsapp")
    return StoreConversationNotificationChannel.WHATSAPP
  return StoreConversationNotificationChannel.PUSH
}

function safeChannel(channel: StoreConversationNotificationChannel) {
  if (channel === StoreConversationNotificationChannel.EMAIL)
    return "email" as const
  if (channel === StoreConversationNotificationChannel.WHATSAPP)
    return "whatsapp" as const
  return "push" as const
}

export async function scheduleUnreadStoreConversationNotificationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    conversationId: string
    messageId: string
    messageSequence: number
    now: Date
    storeId: string
    tenantId: string
  },
) {
  const conversation = await tx.storeConversation.findFirst({
    select: {
      accountAccess: {
        select: { accountUserId: true },
      },
      guestIdentityId: true,
      store: {
        select: {
          storeConversationAvailabilityConfiguration: {
            select: { unreadNotificationGraceSeconds: true },
          },
        },
      },
    },
    where: {
      id: input.conversationId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!conversation) return null
  const accountAccess = conversation.accountAccess
  const configuration =
    conversation.store?.storeConversationAvailabilityConfiguration
  const graceSeconds = Math.min(
    Math.max(configuration?.unreadNotificationGraceSeconds ?? 45, 30),
    60,
  )
  const scheduledFor = new Date(input.now.getTime() + graceSeconds * 1_000)
  const principalKind = accountAccess
    ? StoreConversationNotificationPrincipalKind.ACCOUNT
    : StoreConversationNotificationPrincipalKind.GUEST_IDENTITY
  const principalId =
    accountAccess?.accountUserId ?? conversation.guestIdentityId
  const coalescingKey = [
    "store-conversation-unread",
    input.conversationId,
    principalKind,
    principalId,
  ].join(":")
  const existing = await tx.storeConversationNotificationIntent.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where: {
      coalescingKey,
      kind: StoreConversationNotificationKind.UNREAD_RESPONSE,
      status: StoreConversationNotificationIntentStatus.PENDING,
    },
  })
  if (existing) {
    const intent = await tx.storeConversationNotificationIntent.update({
      data: {
        lastFailureCode: null,
        nextAttemptAt: scheduledFor,
        scheduledFor,
        targetMessageId: input.messageId,
        targetMessageSequence: input.messageSequence,
      },
      where: { id: existing.id },
    })
    await tx.storeConversationNotificationAuditEvent.create({
      data: {
        actorAccountUserId: accountAccess?.accountUserId,
        actorGuestIdentityId: accountAccess
          ? undefined
          : conversation.guestIdentityId,
        conversationId: input.conversationId,
        notificationIntentId: intent.id,
        reasonCode: "unread_response_coalesced",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: StoreConversationNotificationAuditType.INTENT_COALESCED,
      },
    })
    return intent
  }
  const intent = await tx.storeConversationNotificationIntent.create({
    data: {
      accountUserId: accountAccess?.accountUserId,
      coalescingKey,
      deduplicationKey: `${coalescingKey}:${input.messageId}`,
      guestIdentityId: accountAccess ? undefined : conversation.guestIdentityId,
      kind: StoreConversationNotificationKind.UNREAD_RESPONSE,
      nextAttemptAt: scheduledFor,
      principalKind,
      scheduledFor,
      conversationId: input.conversationId,
      storeId: input.storeId,
      targetMessageId: input.messageId,
      targetMessageSequence: input.messageSequence,
      tenantId: input.tenantId,
    },
  })
  await tx.storeConversationNotificationAuditEvent.create({
    data: {
      actorAccountUserId: accountAccess?.accountUserId,
      actorGuestIdentityId: accountAccess
        ? undefined
        : conversation.guestIdentityId,
      conversationId: input.conversationId,
      notificationIntentId: intent.id,
      reasonCode: "unread_response_scheduled",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: StoreConversationNotificationAuditType.INTENT_SCHEDULED,
    },
  })
  return intent
}

export async function listDueStoreConversationNotificationIntents(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
): Promise<StoreConversationNotificationIdentifier[]> {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const intents = await db.storeConversationNotificationIntent.findMany({
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    select: { id: true, storeId: true, tenantId: true },
    take: limit,
    where: {
      attemptCount: { lt: 3 },
      nextAttemptAt: { lte: now },
      OR: [
        {
          status: {
            in: [
              StoreConversationNotificationIntentStatus.PENDING,
              StoreConversationNotificationIntentStatus.FAILED,
            ],
          },
        },
        {
          claimExpiresAt: { lte: now },
          status: StoreConversationNotificationIntentStatus.CLAIMED,
        },
      ],
    },
  })
  return intents.map((intent) => ({
    intentId: intent.id,
    storeId: intent.storeId,
    tenantId: intent.tenantId,
  }))
}

async function cancelIntent(
  tx: Prisma.TransactionClient,
  input: {
    accountUserId?: string | null
    guestIdentityId?: string | null
    intentId: string
    reasonCode: string
    conversationId: string
    storeId: string
    tenantId: string
  },
) {
  const now = new Date()
  await Promise.all([
    tx.storeConversationNotificationIntent.updateMany({
      data: {
        cancelledAt: now,
        lastFailureCode: input.reasonCode,
        status: StoreConversationNotificationIntentStatus.CANCELLED,
      },
      where: {
        id: input.intentId,
        status: {
          in: [
            StoreConversationNotificationIntentStatus.PENDING,
            StoreConversationNotificationIntentStatus.FAILED,
            StoreConversationNotificationIntentStatus.CLAIMED,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    tx.storeConversationNotificationAuditEvent.create({
      data: {
        actorAccountUserId: input.accountUserId,
        actorGuestIdentityId: input.guestIdentityId,
        conversationId: input.conversationId,
        notificationIntentId: input.intentId,
        reasonCode: input.reasonCode,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: StoreConversationNotificationAuditType.INTENT_CANCELLED,
      },
    }),
  ])
  return null
}

export type ClaimedStoreConversationNotification = {
  accountEmail: string | null
  attemptId: string
  attemptNumber: number
  channel: "email" | "push" | "whatsapp"
  destinationCiphertext: string | null
  endpointKind: "native_expo" | "web_push" | null
  intentId: string
  kind: "store_reopened" | "unread_response"
  storeName: string
}

export async function claimStoreConversationNotificationIntent(
  db: PrismaClient,
  input: StoreConversationNotificationIdentifier & { now?: Date },
): Promise<ClaimedStoreConversationNotification | null> {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationNotificationIntent"
      WHERE "id" = ${input.intentId}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `)
    const intent = await tx.storeConversationNotificationIntent.findFirst({
      include: {
        accountUser: {
          select: {
            email: true,
            emailVerified: true,
            storeConversationAccountNotificationPreference: true,
          },
        },
        conversation: {
          select: {
            accountAccess: {
              select: { accountUserId: true, linkedGuestIdentityId: true },
            },
            guestAccesses: {
              select: { guestIdentityId: true },
              where: { status: "ACTIVE" },
            },
            guestIdentity: { select: { id: true, status: true } },
            lifecycle: true,
            moderationState: true,
          },
        },
        store: { select: { name: true } },
        targetMessage: {
          select: { authorKind: true, kind: true, sequence: true },
        },
      },
      where: {
        attemptCount: { lt: 3 },
        id: input.intentId,
        nextAttemptAt: { lte: now },
        OR: [
          {
            status: {
              in: [
                StoreConversationNotificationIntentStatus.PENDING,
                StoreConversationNotificationIntentStatus.FAILED,
              ],
            },
          },
          {
            claimExpiresAt: { lte: now },
            status: StoreConversationNotificationIntentStatus.CLAIMED,
          },
        ],
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!intent) return null
    const cancel = (reasonCode: string) =>
      cancelIntent(tx, {
        accountUserId: intent.accountUserId,
        conversationId: intent.conversationId,
        guestIdentityId: intent.guestIdentityId,
        intentId: intent.id,
        reasonCode,
        storeId: intent.storeId,
        tenantId: intent.tenantId,
      })
    if (
      intent.conversation.lifecycle !== StoreConversationLifecycle.ACTIVE ||
      intent.conversation.moderationState !==
        StoreConversationModerationState.OPEN
    ) {
      return cancel("conversation_unavailable")
    }
    if (intent.kind === StoreConversationNotificationKind.UNREAD_RESPONSE) {
      const targetMessage = intent.targetMessage
      const visibleStoreResponse =
        targetMessage &&
        ((targetMessage.authorKind ===
          StoreConversationMessageAuthorKind.STORE_ATTENDANT &&
          targetMessage.kind === StoreConversationMessageKind.STORE_TEXT) ||
          (targetMessage.authorKind ===
            StoreConversationMessageAuthorKind.SYSTEM &&
            targetMessage.kind === StoreConversationMessageKind.ACTION_MESSAGE))
      if (
        !targetMessage ||
        !visibleStoreResponse ||
        intent.targetMessageSequence !== targetMessage.sequence
      ) {
        return cancel("message_not_visible")
      }
    }

    let readThroughSequence = 0
    let orderedChannels: SafeNotificationChannel[] = [
      "push",
      "email",
      "whatsapp",
    ]
    let preferenceEnabled = true
    let accountEmail: string | null = null
    let contactGuestIdentityId: string | null = null
    if (
      intent.principalKind ===
      StoreConversationNotificationPrincipalKind.ACCOUNT
    ) {
      if (
        !intent.accountUserId ||
        intent.conversation.accountAccess?.accountUserId !==
          intent.accountUserId ||
        !intent.accountUser
      ) {
        return cancel("account_access_unavailable")
      }
      const watermark = await tx.storeConversationAccountWatermark.findUnique({
        select: { readThroughSequence: true },
        where: {
          conversationId_accountUserId: {
            accountUserId: intent.accountUserId,
            conversationId: intent.conversationId,
          },
        },
      })
      readThroughSequence = watermark?.readThroughSequence ?? 0
      contactGuestIdentityId =
        intent.conversation.accountAccess.linkedGuestIdentityId
      const preference =
        intent.accountUser.storeConversationAccountNotificationPreference
      if (preference) {
        const projected = projectNotificationPreference(preference)
        orderedChannels = projected.orderedChannels
        preferenceEnabled =
          intent.kind === StoreConversationNotificationKind.UNREAD_RESPONSE
            ? projected.unreadEnabled
            : projected.reopeningEnabled
      } else {
        preferenceEnabled = false
      }
      accountEmail = intent.accountUser.emailVerified
        ? intent.accountUser.email
        : null
    } else {
      if (
        !intent.guestIdentityId ||
        intent.conversation.guestIdentity.status !==
          StoreConversationGuestIdentityStatus.ACTIVE ||
        intent.conversation.accountAccess
      ) {
        return cancel("guest_access_unavailable")
      }
      const [activeCredential, watermarks] = await Promise.all([
        tx.storeConversationGuestCredential.findFirst({
          select: { id: true },
          where: {
            expiresAt: { gt: now },
            guestIdentityId: intent.guestIdentityId,
            status: StoreConversationGuestCredentialStatus.ACTIVE,
          },
        }),
        tx.storeConversationCustomerWatermark.findMany({
          select: { readThroughSequence: true },
          where: {
            conversationId: intent.conversationId,
            credential: {
              expiresAt: { gt: now },
              guestIdentityId: intent.guestIdentityId,
              status: StoreConversationGuestCredentialStatus.ACTIVE,
            },
          },
        }),
      ])
      if (!activeCredential) return cancel("guest_access_unavailable")
      readThroughSequence = watermarks.reduce(
        (highest, watermark) =>
          Math.max(highest, watermark.readThroughSequence),
        0,
      )
      contactGuestIdentityId = intent.guestIdentityId
    }
    if (!preferenceEnabled) return cancel("notification_preference_disabled")
    if (
      intent.targetMessageSequence !== null &&
      readThroughSequence >= intent.targetMessageSequence
    ) {
      return cancel("read_before_notification_claim")
    }

    const [pushEndpoints, emailContact, whatsappContact] = await Promise.all([
      tx.storeConversationPushEndpoint.findMany({
        include: {
          guestCredential: {
            select: { guestIdentityId: true, status: true, expiresAt: true },
          },
        },
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
        take: 10,
        where: {
          conversationId: intent.conversationId,
          status: StoreConversationPushEndpointStatus.ACTIVE,
          storeId: intent.storeId,
          tenantId: intent.tenantId,
        },
      }),
      contactGuestIdentityId
        ? tx.storeConversationGuestNotificationContact.findFirst({
            orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
            where: {
              channel: StoreConversationNotificationContactChannel.EMAIL,
              guestIdentityId: contactGuestIdentityId,
              status: StoreConversationNotificationContactStatus.VERIFIED,
              storeId: intent.storeId,
              tenantId: intent.tenantId,
            },
          })
        : null,
      contactGuestIdentityId
        ? tx.storeConversationGuestNotificationContact.findFirst({
            orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
            where: {
              channel: StoreConversationNotificationContactChannel.WHATSAPP,
              guestIdentityId: contactGuestIdentityId,
              status: StoreConversationNotificationContactStatus.VERIFIED,
              storeId: intent.storeId,
              tenantId: intent.tenantId,
            },
          })
        : null,
    ])
    const participantGuestIdentityIds = new Set([
      intent.conversation.guestIdentity.id,
      ...intent.conversation.guestAccesses.map(
        (access) => access.guestIdentityId,
      ),
    ])
    const pushEndpoint = pushEndpoints.find((endpoint) => {
      // A registered endpoint becomes eligible only when this worker has a
      // current provider adapter. Web push remains explicitly unavailable, so
      // it must not shadow a verified email fallback.
      if (endpoint.kind !== StoreConversationPushEndpointKind.NATIVE_EXPO) {
        return false
      }
      if (
        intent.accountUserId &&
        endpoint.accountUserId === intent.accountUserId
      ) {
        return true
      }
      const credential = endpoint.guestCredential
      if (
        !credential ||
        credential.status !== StoreConversationGuestCredentialStatus.ACTIVE ||
        credential.expiresAt <= now
      ) {
        return false
      }
      if (intent.accountUserId) {
        return (
          credential.guestIdentityId ===
          intent.conversation.accountAccess?.linkedGuestIdentityId
        )
      }
      return participantGuestIdentityIds.has(credential.guestIdentityId)
    })
    // WhatsApp delivery intentionally remains fail-closed until Ticket 13
    // supplies the current Store mode/provider/policy projection. Contact
    // verification alone can never authorize a regulated provider message.
    const channel = selectStoreConversationNotificationChannel({
      eligibility: {
        email: Boolean(accountEmail || emailContact),
        push: Boolean(pushEndpoint),
        whatsapp: false && Boolean(whatsappContact),
      },
      orderedChannels,
    })
    if (!channel) return cancel("no_eligible_notification_channel")
    const attemptNumber = intent.attemptCount + 1
    const attempt = await tx.storeConversationNotificationAttempt.create({
      data: {
        attemptNumber,
        channel: databaseChannel(channel),
        notificationIntentId: intent.id,
        status: StoreConversationNotificationAttemptStatus.CLAIMED,
        storeId: intent.storeId,
        tenantId: intent.tenantId,
      },
    })
    await Promise.all([
      tx.storeConversationNotificationIntent.update({
        data: {
          attemptCount: attemptNumber,
          claimedAt: now,
          claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
          lastFailureCode: null,
          selectedChannel: databaseChannel(channel),
          selectedContactId:
            channel === "email" ? (emailContact?.id ?? null) : null,
          selectedPushEndpointId:
            channel === "push" ? (pushEndpoint?.id ?? null) : null,
          status: StoreConversationNotificationIntentStatus.CLAIMED,
        },
        where: { id: intent.id },
      }),
      tx.storeConversationNotificationAuditEvent.create({
        data: {
          actorAccountUserId: intent.accountUserId,
          actorGuestIdentityId: intent.guestIdentityId,
          conversationId: intent.conversationId,
          notificationIntentId: intent.id,
          reasonCode: `notification_claimed_${channel}`,
          storeId: intent.storeId,
          tenantId: intent.tenantId,
          type: StoreConversationNotificationAuditType.INTENT_CLAIMED,
        },
      }),
    ])
    return {
      accountEmail: channel === "email" ? accountEmail : null,
      attemptId: attempt.id,
      attemptNumber,
      channel,
      destinationCiphertext:
        channel === "push"
          ? (pushEndpoint?.endpointCiphertext ?? null)
          : channel === "email"
            ? (emailContact?.destinationCiphertext ?? null)
            : (whatsappContact?.destinationCiphertext ?? null),
      endpointKind:
        channel === "push"
          ? pushEndpoint?.kind === "NATIVE_EXPO"
            ? "native_expo"
            : "web_push"
          : null,
      intentId: intent.id,
      kind:
        intent.kind === StoreConversationNotificationKind.UNREAD_RESPONSE
          ? "unread_response"
          : "store_reopened",
      storeName: intent.store.name,
    }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}

export async function completeStoreConversationNotificationAttempt(
  db: PrismaClient,
  input: StoreConversationNotificationIdentifier & {
    attemptId: string
    now?: Date
    providerKey: string
    providerOperationDigest?: string
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    const attempt = await tx.storeConversationNotificationAttempt.findFirst({
      include: {
        notificationIntent: { select: { conversationId: true } },
      },
      where: {
        id: input.attemptId,
        notificationIntentId: input.intentId,
        notificationIntent: {
          status: StoreConversationNotificationIntentStatus.CLAIMED,
        },
        status: StoreConversationNotificationAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!attempt) return null
    await Promise.all([
      tx.storeConversationNotificationAttempt.update({
        data: {
          completedAt: now,
          providerKey: input.providerKey,
          providerOperationDigest: input.providerOperationDigest,
          status: StoreConversationNotificationAttemptStatus.SENT,
        },
        where: { id: attempt.id },
      }),
      tx.storeConversationNotificationIntent.update({
        data: {
          claimExpiresAt: null,
          sentAt: now,
          status: StoreConversationNotificationIntentStatus.SENT,
        },
        where: { id: input.intentId },
      }),
      tx.storeConversationNotificationAuditEvent.create({
        data: {
          conversationId: attempt.notificationIntent.conversationId,
          notificationIntentId: input.intentId,
          reasonCode: "notification_attempt_sent",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationNotificationAuditType.ATTEMPT_COMPLETED,
        },
      }),
    ])
    return { sentAt: now }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}

export async function failStoreConversationNotificationAttempt(
  db: PrismaClient,
  input: StoreConversationNotificationIdentifier & {
    attemptId: string
    failureCode: string
    now?: Date
    outcomeUnknown?: boolean
    retryAt?: Date
    terminal?: boolean
  },
) {
  const now = input.now ?? new Date()
  const status = input.outcomeUnknown
    ? StoreConversationNotificationAttemptStatus.OUTCOME_UNKNOWN
    : StoreConversationNotificationAttemptStatus.FAILED
  const intentStatus = input.outcomeUnknown
    ? StoreConversationNotificationIntentStatus.OUTCOME_UNKNOWN
    : StoreConversationNotificationIntentStatus.FAILED
  return db.$transaction(async (tx) => {
    const attempt = await tx.storeConversationNotificationAttempt.findFirst({
      include: {
        notificationIntent: {
          select: {
            attemptCount: true,
            conversationId: true,
            maxAttempts: true,
          },
        },
      },
      where: {
        id: input.attemptId,
        notificationIntentId: input.intentId,
        status: StoreConversationNotificationAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!attempt) return null
    const terminal =
      Boolean(input.terminal) ||
      Boolean(input.outcomeUnknown) ||
      attempt.notificationIntent.attemptCount >=
        attempt.notificationIntent.maxAttempts
    const retryAt = terminal
      ? null
      : (input.retryAt ??
        new Date(
          now.getTime() +
            Math.min(
              5 * 60_000,
              30_000 * 2 ** (attempt.notificationIntent.attemptCount - 1),
            ),
        ))
    await Promise.all([
      tx.storeConversationNotificationAttempt.update({
        data: {
          completedAt: now,
          failureCode: input.failureCode,
          status,
        },
        where: { id: attempt.id },
      }),
      tx.storeConversationNotificationIntent.update({
        data: {
          claimExpiresAt: null,
          lastFailureCode: input.failureCode,
          nextAttemptAt: retryAt,
          status: intentStatus,
        },
        where: { id: input.intentId },
      }),
      tx.storeConversationNotificationAuditEvent.create({
        data: {
          conversationId: attempt.notificationIntent.conversationId,
          notificationIntentId: input.intentId,
          reasonCode: input.outcomeUnknown
            ? "notification_provider_outcome_unknown"
            : terminal
              ? "notification_attempt_terminal_failure"
              : "notification_attempt_retryable_failure",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationNotificationAuditType.ATTEMPT_FAILED,
        },
      }),
    ])
    return {
      failedAt: now,
      outcomeUnknown: Boolean(input.outcomeUnknown),
      retryAt,
    }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}

export async function invalidateStoreConversationNotificationPushEndpoint(
  db: PrismaClient,
  input: StoreConversationNotificationIdentifier & {
    attemptId: string
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    const intent = await tx.storeConversationNotificationIntent.findFirst({
      select: { selectedPushEndpointId: true },
      where: {
        attempts: { some: { id: input.attemptId } },
        id: input.intentId,
        selectedPushEndpointId: { not: null },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!intent?.selectedPushEndpointId) return null
    await tx.storeConversationPushEndpoint.updateMany({
      data: {
        invalidatedAt: now,
        status: StoreConversationPushEndpointStatus.INVALIDATED,
      },
      where: {
        id: intent.selectedPushEndpointId,
        status: StoreConversationPushEndpointStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return { endpointId: intent.selectedPushEndpointId }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}

export async function recordStoreConversationNotificationReceipt(
  db: PrismaClient,
  input: StoreConversationNotificationIdentifier & {
    occurredAt: Date
    providerKey: string
    providerReceiptDigest: string
    status: "delivered" | "failed"
  },
) {
  return db.$transaction(async (tx) => {
    const intent = await tx.storeConversationNotificationIntent.findFirst({
      select: { conversationId: true, status: true },
      where: {
        id: input.intentId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!intent) return null
    const receipt = await tx.storeConversationNotificationReceipt.upsert({
      create: {
        notificationIntentId: input.intentId,
        occurredAt: input.occurredAt,
        providerKey: input.providerKey,
        providerReceiptDigest: input.providerReceiptDigest,
        status:
          input.status === "delivered"
            ? StoreConversationNotificationReceiptStatus.DELIVERED
            : StoreConversationNotificationReceiptStatus.FAILED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {},
      where: {
        tenantId_providerKey_providerReceiptDigest: {
          providerKey: input.providerKey,
          providerReceiptDigest: input.providerReceiptDigest,
          tenantId: input.tenantId,
        },
      },
    })
    if (receipt.notificationIntentId !== input.intentId) return null
    await tx.storeConversationNotificationIntent.updateMany({
      data:
        input.status === "delivered"
          ? {
              deliveredAt: input.occurredAt,
              status: StoreConversationNotificationIntentStatus.DELIVERED,
            }
          : {
              lastFailureCode: "provider_delivery_failed",
              status: StoreConversationNotificationIntentStatus.FAILED,
            },
      where: {
        id: input.intentId,
        status: {
          in: [
            StoreConversationNotificationIntentStatus.SENT,
            StoreConversationNotificationIntentStatus.DELIVERED,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return {
      occurredAt: receipt.occurredAt,
      status:
        receipt.status === StoreConversationNotificationReceiptStatus.DELIVERED
          ? ("delivered" as const)
          : ("failed" as const),
    }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}
