import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  claimStoreConversationNotificationIntent,
  claimStoreConversationNotificationVerification,
  completeStoreConversationNotificationAttempt,
  confirmGuestStoreConversationNotificationContact,
  failStoreConversationNotificationAttempt,
  releaseStoreConversationReopeningIntent,
  requestGuestStoreConversationNotificationVerification,
  scheduleUnreadStoreConversationNotificationInTransaction,
} from "./store-conversation-notifications"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

function guestNotificationDependencies() {
  return {
    customerEntryPoint: {
      findFirst: async () => ({
        id: "entry_1",
        revision: 1,
        store: { name: "Ada Pharmacy" },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 8 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        intakeEnabled: true,
        status: "ACTIVE",
        webEnabled: true,
        whatsappEnabled: false,
      }),
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () => ({ id: "assignment_1" }),
    },
    store: {
      findFirst: async () => ({
        countryCode: "NG",
        prescriptionChannel: null,
        prescriptionRoles: [],
        prescriptionSettings: null,
        serviceCommercePolicyDecisions:
          allowedServiceCommercePolicyDecisionRows(),
        serviceCommerceProfile: {
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: false,
        },
        serviceCommerceStoreTeamAssignments: [{ id: "assignment_1" }],
        serviceRequestForms: [],
        storeConversationAvailabilityConfiguration: null,
        storeConversationChannelConfiguration: null,
        tenant: { timezone: "Africa/Lagos" },
        whatsappStoreBindings: [],
      }),
    },
    storeConversation: {
      findFirst: async () => ({
        guestIdentityId: "guest_1",
        id: "conversation_1",
        store: { name: "Ada Pharmacy" },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    },
    storeConversationGuestCredential: {
      findFirst: async () => ({
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        guestIdentity: { id: "guest_1", status: "ACTIVE" },
        guestIdentityId: "guest_1",
        id: "credential_1",
        purpose: "WEB_DEVICE",
        status: "ACTIVE",
      }),
      update: async () => ({ id: "credential_1" }),
    },
    storeConversationGuestIdentity: {
      update: async () => ({ id: "guest_1" }),
    },
    whatsAppStoreBinding: { findMany: async () => [] },
  }
}

describe("Store Conversation notification repositories", () => {
  test("rejects a Guest verification write without explicit notification-only consent", async () => {
    await expect(
      requestGuestStoreConversationNotificationVerification(dbClient({}), {
        channel: "email",
        clientOperationId: "operation_12345678",
        consentAccepted: false as true,
        conversationId: "conversation_1",
        credentialToken: "credential-token-that-is-at-least-32-chars",
        destinationCiphertext: "protected_destination",
        destinationDigest: "destination_digest",
        maskedDestination: "cu•••@example.test",
        publicToken: "public-token-that-is-at-least-32-characters",
        tokenDigest: "verification_code_digest",
        verificationId: "verification_1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("rate limits the sixth Guest verification request in one Store hour", async () => {
    let contactWrites = 0
    const client = {
      ...guestNotificationDependencies(),
      $queryRaw: async () => [{ id: "conversation_1" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(dbClient(client)),
      storeConversationGuestNotificationContact: {
        upsert: async () => {
          contactWrites += 1
          return { id: "contact_1" }
        },
      },
      storeConversationGuestNotificationVerification: {
        count: async () => 5,
        findUnique: async () => null,
      },
    }

    await expect(
      requestGuestStoreConversationNotificationVerification(dbClient(client), {
        channel: "email",
        clientOperationId: "operation_12345678",
        consentAccepted: true,
        conversationId: "conversation_1",
        credentialToken: "credential-token-that-is-at-least-32-chars",
        destinationCiphertext: "protected_destination",
        destinationDigest: "destination_digest",
        maskedDestination: "cu•••@example.test",
        now: new Date("2026-08-15T12:00:00.000Z"),
        publicToken: "public-token-that-is-at-least-32-characters",
        tokenDigest: "verification_code_digest",
        verificationId: "verification_1",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" })
    expect(contactWrites).toBe(0)
  })

  test("expires a Guest verification challenge before accepting its code", async () => {
    const verificationUpdates: Array<Record<string, unknown>> = []
    const client = {
      ...guestNotificationDependencies(),
      $queryRaw: async () => [{ id: "verification_1" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(dbClient(client)),
      storeConversationGuestNotificationVerification: {
        findFirst: async () => ({
          attemptCount: 0,
          contact: {
            channel: "EMAIL",
            id: "contact_1",
            maskedDestination: "cu•••@example.test",
            status: "PENDING",
            verifiedAt: null,
          },
          expiresAt: new Date("2026-08-15T11:59:00.000Z"),
          id: "verification_1",
          maxAttempts: 5,
          status: "SENT",
          tokenDigest: "verification_code_digest",
        }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          verificationUpdates.push(data)
          return { count: 1 }
        },
      },
    }

    await expect(
      confirmGuestStoreConversationNotificationContact(dbClient(client), {
        clientOperationId: "operation_12345678",
        codeDigest: "verification_code_digest",
        conversationId: "conversation_1",
        credentialToken: "credential-token-that-is-at-least-32-chars",
        now: new Date("2026-08-15T12:00:00.000Z"),
        publicToken: "public-token-that-is-at-least-32-characters",
        verificationId: "verification_1",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(verificationUpdates[0]).toMatchObject({ status: "EXPIRED" })
  })

  test("replays a consumed Guest verification only for the same code digest", async () => {
    const client = {
      ...guestNotificationDependencies(),
      $queryRaw: async () => [{ id: "verification_1" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(dbClient(client)),
      storeConversationGuestNotificationVerification: {
        findFirst: async () => ({
          attemptCount: 1,
          contact: {
            channel: "EMAIL",
            id: "contact_1",
            maskedDestination: "cu•••@example.test",
            status: "VERIFIED",
            verifiedAt: new Date("2026-08-15T12:00:00.000Z"),
          },
          expiresAt: new Date("2026-08-15T12:10:00.000Z"),
          id: "verification_1",
          maxAttempts: 5,
          status: "CONSUMED",
          tokenDigest: "verification_code_digest",
        }),
      },
    }

    await expect(
      confirmGuestStoreConversationNotificationContact(dbClient(client), {
        clientOperationId: "operation_12345678",
        codeDigest: "verification_code_digest",
        conversationId: "conversation_1",
        credentialToken: "credential-token-that-is-at-least-32-chars",
        now: new Date("2026-08-15T12:01:00.000Z"),
        publicToken: "public-token-that-is-at-least-32-characters",
        verificationId: "verification_1",
      }),
    ).resolves.toMatchObject({
      contact: { contactId: "contact_1", state: "verified" },
      replayed: true,
    })
  })

  test("expires a verification claim when the Guest credential was revoked", async () => {
    const verificationUpdates: Array<Record<string, unknown>> = []
    const client = dbClient({
      $queryRaw: async () => [{ id: "verification_1" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client),
      storeConversationGuestCredential: { findFirst: async () => null },
      storeConversationGuestNotificationVerification: {
        findFirst: async () => ({
          contact: {
            channel: "EMAIL",
            destinationCiphertext: "protected_destination",
            status: "PENDING",
          },
          conversation: {
            guestAccesses: [],
            guestIdentityId: "guest_1",
            lifecycle: "ACTIVE",
            moderationState: "OPEN",
          },
          expiresAt: new Date("2026-08-15T12:10:00.000Z"),
          guestIdentity: { status: "ACTIVE" },
          guestIdentityId: "guest_1",
          id: "verification_1",
          maxSendAttempts: 3,
          sendAttemptCount: 0,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          verificationUpdates.push(data)
          return { id: "verification_1", ...data }
        },
      },
    })

    await expect(
      claimStoreConversationNotificationVerification(client, {
        now: new Date("2026-08-15T12:00:00.000Z"),
        storeId: "store_1",
        tenantId: "tenant_1",
        verificationId: "verification_1",
      }),
    ).resolves.toBeNull()
    expect(verificationUpdates[0]).toMatchObject({
      lastFailureCode: "verification_authorization_unavailable",
      status: "EXPIRED",
    })
  })

  test("schedules one 45-second unread intent and coalesces a later reply", async () => {
    const audits: Array<Record<string, unknown>> = []
    const created: Array<Record<string, unknown>> = []
    const updated: Array<Record<string, unknown>> = []
    let pendingIntent: Record<string, unknown> | null = null
    const client = dbClient({
      storeConversation: {
        findFirst: async () => ({
          accountAccess: null,
          guestIdentityId: "guest_1",
          store: { storeConversationAvailabilityConfiguration: null },
        }),
      },
      storeConversationNotificationAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data)
          return { id: `audit_${audits.length}` }
        },
      },
      storeConversationNotificationIntent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          pendingIntent = { id: "intent_1", ...data }
          created.push(data)
          return pendingIntent
        },
        findFirst: async () => pendingIntent,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          pendingIntent = { ...pendingIntent, ...data }
          updated.push(data)
          return pendingIntent
        },
      },
    })
    const now = new Date("2026-08-15T12:00:00.000Z")

    const first =
      await scheduleUnreadStoreConversationNotificationInTransaction(client, {
        conversationId: "conversation_1",
        messageId: "message_2",
        messageSequence: 2,
        now,
        storeId: "store_1",
        tenantId: "tenant_1",
      })
    const second =
      await scheduleUnreadStoreConversationNotificationInTransaction(client, {
        conversationId: "conversation_1",
        messageId: "message_3",
        messageSequence: 3,
        now: new Date(now.getTime() + 10_000),
        storeId: "store_1",
        tenantId: "tenant_1",
      })

    expect(first?.scheduledFor).toEqual(new Date("2026-08-15T12:00:45.000Z"))
    expect(second?.scheduledFor).toEqual(new Date("2026-08-15T12:00:55.000Z"))
    expect(created).toHaveLength(1)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({
      targetMessageId: "message_3",
      targetMessageSequence: 3,
    })
    expect(audits.map((event) => event.type)).toEqual([
      "INTENT_SCHEDULED",
      "INTENT_COALESCED",
    ])
  })

  test("cancels before provider selection when the account already read the reply", async () => {
    const intentUpdates: Array<Record<string, unknown>> = []
    const auditWrites: Array<Record<string, unknown>> = []
    const client = dbClient({
      $queryRaw: async () => [{ id: "intent_1" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountWatermark: {
        findUnique: async () => ({ readThroughSequence: 7 }),
      },
      storeConversationNotificationAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          auditWrites.push(data)
          return { id: "audit_1" }
        },
      },
      storeConversationNotificationIntent: {
        findFirst: async () => ({
          accountUser: {
            email: "customer@example.test",
            emailVerified: true,
            storeConversationAccountNotificationPreference: {
              orderedChannels: ["push", "email", "whatsapp"],
              reopeningEnabled: true,
              unreadEnabled: true,
            },
          },
          accountUserId: "account_1",
          attemptCount: 0,
          conversation: {
            accountAccess: {
              accountUserId: "account_1",
              linkedGuestIdentityId: "guest_1",
            },
            guestIdentity: { status: "ACTIVE" },
            lifecycle: "ACTIVE",
            moderationState: "OPEN",
          },
          conversationId: "conversation_1",
          guestIdentityId: null,
          id: "intent_1",
          kind: "UNREAD_RESPONSE",
          principalKind: "ACCOUNT",
          store: { name: "Ada Pharmacy" },
          storeId: "store_1",
          targetMessage: {
            authorKind: "STORE_ATTENDANT",
            kind: "STORE_TEXT",
            sequence: 7,
          },
          targetMessageSequence: 7,
          tenantId: "tenant_1",
        }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          intentUpdates.push(data)
          return { count: 1 }
        },
      },
    })

    await expect(
      claimStoreConversationNotificationIntent(client, {
        intentId: "intent_1",
        now: new Date("2026-08-15T12:01:00.000Z"),
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).resolves.toBeNull()
    expect(intentUpdates).toHaveLength(1)
    expect(intentUpdates[0]).toMatchObject({
      lastFailureCode: "read_before_notification_claim",
      status: "CANCELLED",
    })
    expect(auditWrites[0]).toMatchObject({
      reasonCode: "read_before_notification_claim",
      type: "INTENT_CANCELLED",
    })
  })

  test("claims a released Quote notification through email when web push is provider-unready", async () => {
    const intentUpdates: Array<Record<string, unknown>> = []
    const attempts: Array<Record<string, unknown>> = []
    const client = dbClient({
      $queryRaw: async () => [{ id: "intent_1" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountWatermark: {
        findUnique: async () => ({ readThroughSequence: 0 }),
      },
      storeConversationGuestNotificationContact: {
        findFirst: async () => null,
      },
      storeConversationNotificationAttempt: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          attempts.push(data)
          return { id: "attempt_1", ...data }
        },
      },
      storeConversationNotificationAuditEvent: {
        create: async () => ({ id: "audit_1" }),
      },
      storeConversationNotificationIntent: {
        findFirst: async () => ({
          accountUser: {
            email: "customer@example.test",
            emailVerified: true,
            storeConversationAccountNotificationPreference: {
              orderedChannels: ["push", "email", "whatsapp"],
              reopeningEnabled: true,
              unreadEnabled: true,
            },
          },
          accountUserId: "account_1",
          attemptCount: 0,
          conversation: {
            accountAccess: {
              accountUserId: "account_1",
              linkedGuestIdentityId: "guest_1",
            },
            guestAccesses: [],
            guestIdentity: { id: "guest_1", status: "ACTIVE" },
            lifecycle: "ACTIVE",
            moderationState: "OPEN",
          },
          conversationId: "conversation_1",
          guestIdentityId: null,
          id: "intent_1",
          kind: "UNREAD_RESPONSE",
          principalKind: "ACCOUNT",
          store: { name: "Ada Pharmacy" },
          storeId: "store_1",
          targetMessage: {
            authorKind: "SYSTEM",
            kind: "ACTION_MESSAGE",
            sequence: 7,
          },
          targetMessageSequence: 7,
          tenantId: "tenant_1",
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          intentUpdates.push(data)
          return { id: "intent_1", ...data }
        },
      },
      storeConversationPushEndpoint: {
        findMany: async () => [
          {
            accountUserId: "account_1",
            endpointCiphertext: "protected_web_endpoint",
            guestCredential: null,
            id: "endpoint_web_1",
            kind: "WEB_PUSH",
          },
        ],
      },
    })

    await expect(
      claimStoreConversationNotificationIntent(client, {
        intentId: "intent_1",
        now: new Date("2026-08-15T12:01:00.000Z"),
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).resolves.toMatchObject({
      accountEmail: "customer@example.test",
      channel: "email",
      destinationCiphertext: null,
      endpointKind: null,
    })
    expect(attempts[0]).toMatchObject({ channel: "EMAIL" })
    expect(intentUpdates[0]).toMatchObject({
      selectedChannel: "EMAIL",
      selectedPushEndpointId: null,
    })
  })

  test("records explicit success and preserves ambiguous provider outcomes", async () => {
    const attempts: Array<Record<string, unknown>> = []
    const intents: Array<Record<string, unknown>> = []
    const audits: Array<Record<string, unknown>> = []
    const client = dbClient({
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client),
      storeConversationNotificationAttempt: {
        findFirst: async () => ({
          id: "attempt_1",
          notificationIntent: {
            attemptCount: 1,
            conversationId: "conversation_1",
            maxAttempts: 3,
          },
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          attempts.push(data)
          return { id: "attempt_1", ...data }
        },
      },
      storeConversationNotificationIntent: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          intents.push(data)
          return { id: "intent_1", ...data }
        },
      },
      storeConversationNotificationAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data)
          return { id: `audit_${audits.length}` }
        },
      },
    })
    const identifier = {
      attemptId: "attempt_1",
      intentId: "intent_1",
      now: new Date("2026-08-15T12:02:00.000Z"),
      storeId: "store_1",
      tenantId: "tenant_1",
    }

    await completeStoreConversationNotificationAttempt(client, {
      ...identifier,
      providerKey: "deterministic_push",
      providerOperationDigest: "provider_operation_digest_1",
    })
    await failStoreConversationNotificationAttempt(client, {
      ...identifier,
      failureCode: "provider_outcome_unknown",
      outcomeUnknown: true,
    })

    expect(attempts[0]).toMatchObject({ status: "SENT" })
    expect(intents[0]).toMatchObject({ status: "SENT" })
    expect(attempts[1]).toMatchObject({ status: "OUTCOME_UNKNOWN" })
    expect(intents[1]).toMatchObject({
      nextAttemptAt: null,
      status: "OUTCOME_UNKNOWN",
    })
    expect(audits.map((audit) => audit.type)).toEqual([
      "ATTEMPT_COMPLETED",
      "ATTEMPT_FAILED",
    ])
  })

  test("releases reopening delivery only after server availability becomes true", async () => {
    const intentUpdates: Array<Record<string, unknown>> = []
    const audits: Array<Record<string, unknown>> = []
    const client = dbClient({
      $queryRaw: async () => [{ id: "intent_reopening" }],
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client),
      storeConversationNotificationAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data)
          return { id: "audit_reopening" }
        },
      },
      storeConversationNotificationIntent: {
        findFirst: async () => ({
          conversationId: "conversation_1",
          id: "intent_reopening",
          subscribedAt: new Date("2026-08-15T11:00:00.000Z"),
        }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          intentUpdates.push(data)
          return { count: 1 }
        },
      },
    })
    const input = {
      intentId: "intent_reopening",
      now: new Date("2026-08-15T12:00:00.000Z"),
      storeId: "store_1",
      tenantId: "tenant_1",
    }

    await expect(
      releaseStoreConversationReopeningIntent(client, input, {
        resolveAvailability: async () => ({ available: false }),
      }),
    ).resolves.toBeNull()
    expect(intentUpdates).toHaveLength(0)
    await expect(
      releaseStoreConversationReopeningIntent(client, input, {
        resolveAvailability: async () => ({ available: true }),
      }),
    ).resolves.toMatchObject({ intentId: "intent_reopening" })
    expect(intentUpdates).toHaveLength(1)
    expect(intentUpdates[0]).toMatchObject({
      status: "PENDING",
    })
    expect(audits[0]).toMatchObject({
      reasonCode: "store_availability_reopened_after_subscription",
      type: "REOPENING_RELEASED",
    })
  })
})
