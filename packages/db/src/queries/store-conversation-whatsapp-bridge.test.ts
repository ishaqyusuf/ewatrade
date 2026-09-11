import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationWhatsAppBridgeError,
  claimStoreConversationWhatsAppBridgePrompt,
  consumeStoreConversationWhatsAppBridge,
  listDueStoreConversationWhatsAppBridgePrompts,
  resolveStoreConversationWhatsAppBridgeInboundRoute,
  selectStoreConversationWhatsAppBridgeChoice,
  selectStoreConversationWhatsAppBridgeRequestKind,
} from "./store-conversation-whatsapp-bridge"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const digest = "d".repeat(64)

function bridgeRecord(input: {
  choice?: "START_NEW_REQUEST" | null
  revision: number
  status: "ACTIVE" | "AWAITING_CHOICE" | "AWAITING_REQUEST_KIND"
}) {
  return {
    accountAccessId: null,
    capabilityId: "capability_1",
    choice: input.choice ?? null,
    connectionId: "connection_1",
    conversationId: "conversation_1",
    externalCustomerIdCiphertext: "recipient_ciphertext",
    externalCustomerIdDigest: digest,
    guestIdentityId: "guest_1",
    id: "bridge_1",
    revision: input.revision,
    sourceId: null,
    sourceKind: null,
    sourceRevision: null,
    status: input.status,
    storeId: "store_1",
    tenantId: "tenant_1",
    updatedAt: new Date("2026-08-16T09:00:00Z"),
  }
}

function createDb(initialBridge: ReturnType<typeof bridgeRecord>) {
  let bridge = initialBridge
  const attempts: Array<Record<string, unknown>> = []
  const audits: Array<Record<string, unknown>> = []
  const messages: Array<Record<string, unknown>> = []
  const binding = {
    connection: {
      businessVerified: true,
      credentialReference: "credential_ciphertext",
      displayNumber: "+2348000000000",
      id: "connection_1",
      numberVerified: true,
      outboundVerified: true,
      phoneNumberId: "phone_number_1",
      status: "ACTIVE",
      templatesReady: true,
      tenantId: "tenant_1",
      webhookSubscribed: true,
    },
    connectionId: "connection_1",
    status: "ACTIVE",
    tenantId: "tenant_1",
  }
  const client = {
    $queryRaw: async () => [{ id: "locked" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 8 }) },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        intakeEnabled: true,
        status: "ACTIVE",
        webEnabled: true,
        whatsappEnabled: true,
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
          whatsappEnabled: true,
        },
        serviceCommerceStoreTeamAssignments: [{ id: "assignment_1" }],
        serviceRequestForms: [],
        storeConversationAvailabilityConfiguration: null,
        storeConversationChannelConfiguration: {
          desiredMode: "BOTH",
          revision: 1,
        },
        tenant: { timezone: "Africa/Lagos" },
        whatsappStoreBindings: [binding],
      }),
    },
    storeConversation: {
      findFirst: async ({ select }: { select?: Record<string, unknown> }) =>
        select?.lastMessageSequence
          ? { id: "conversation_1", lastMessageSequence: messages.length }
          : { id: "conversation_1" },
      updateMany: async () => ({ count: 1 }),
    },
    storeConversationMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const message = { ...data, id: `message_${messages.length + 1}` }
        messages.push(message)
        return message
      },
    },
    storeConversationWhatsAppBridge: {
      findMany: async () => [bridge],
      findUnique: async () => bridge,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        bridge = {
          ...bridge,
          choice: (data.choice as typeof bridge.choice) ?? bridge.choice,
          revision:
            typeof data.revision === "object"
              ? bridge.revision + 1
              : bridge.revision,
          sourceId: (data.sourceId as null) ?? bridge.sourceId,
          sourceKind: (data.sourceKind as null) ?? bridge.sourceKind,
          sourceRevision:
            (data.sourceRevision as null) ?? bridge.sourceRevision,
          status: data.status as typeof bridge.status,
        }
        return bridge
      },
    },
    storeConversationWhatsAppBridgeAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        attempts.push(data)
        return { id: `attempt_${attempts.length}`, ...data }
      },
    },
    storeConversationWhatsAppBridgeAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data)
        return { id: `audit_${audits.length}`, ...data }
      },
    },
    storeConversationWhatsAppBridgeChoiceCapability: {
      findUnique: async () => ({
        bridge,
        bridgeId: bridge.id,
        bridgeRevision: bridge.revision,
        choice: "START_NEW_REQUEST",
        expiresAt: new Date("2026-08-16T10:00:00Z"),
        id: "choice_1",
        status: "ACTIVE",
      }),
      update: async () => ({ id: "choice_1" }),
      updateMany: async () => ({ count: 1 }),
    },
    whatsAppStoreBinding: { findMany: async () => [binding] },
  }
  return {
    attempts,
    audits,
    client: client as unknown as PrismaClient,
    getBridge: () => bridge,
    messages,
  }
}

describe("Store Conversation WhatsApp bridge repository", () => {
  test("rejects expired, replayed and wrong-Connection codes before bridge writes", async () => {
    const now = new Date("2026-08-16T09:30:00Z")
    const scenarios = [
      {
        code: "EXPIRED",
        connectionId: "connection_1",
        expiresAt: new Date("2026-08-16T09:29:59Z"),
        status: "PENDING",
      },
      {
        code: "EXPIRED",
        connectionId: "connection_1",
        expiresAt: new Date("2026-08-16T10:00:00Z"),
        status: "CONSUMED",
      },
      {
        code: "FORBIDDEN",
        connectionId: "connection_other",
        expiresAt: new Date("2026-08-16T10:00:00Z"),
        status: "PENDING",
      },
    ] as const

    for (const scenario of scenarios) {
      let writes = 0
      const capability = {
        accountAccessId: null,
        connectionId: "connection_1",
        conversationId: "conversation_1",
        expiresAt: scenario.expiresAt,
        guestIdentityId: "guest_1",
        id: "capability_1",
        status: scenario.status,
        storeId: "store_1",
        tenantId: "tenant_1",
      }
      const client = {
        $queryRaw: async () => [{ id: "capability_1" }],
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback(client),
        storeConversationWhatsAppBridge: {
          create: async () => {
            writes += 1
          },
        },
        storeConversationWhatsAppBridgeCapability: {
          findUnique: async () => capability,
        },
      } as unknown as PrismaClient

      await expect(
        consumeStoreConversationWhatsAppBridge(client, {
          bridgeTokenDigest: digest,
          connectionId: scenario.connectionId,
          externalCustomerIdCiphertext: "recipient_ciphertext",
          externalCustomerIdDigest: digest,
          now,
          tokenServices: {
            deriveChoiceToken: () => `ewb1_${"a".repeat(43)}`,
            digestToken: () => digest,
          },
        }),
      ).rejects.toMatchObject({ code: scenario.code })
      expect(writes).toBe(0)
    }
  })

  test("makes the newest verified code the only current route on a shared Connection", async () => {
    const updates: Array<{ model: string; value: Record<string, unknown> }> = []
    const oldBridge = {
      ...bridgeRecord({ revision: 4, status: "ACTIVE" }),
      conversationId: "conversation_old",
      id: "bridge_old",
      storeId: "store_old",
    }
    const capability = {
      accountAccessId: null,
      connectionId: "connection_1",
      conversationId: "conversation_1",
      expiresAt: new Date("2026-08-16T10:00:00Z"),
      guestIdentityId: "guest_1",
      id: "capability_new",
      sourceId: null,
      sourceKind: null,
      sourceRevision: null,
      status: "PENDING",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiry: { findMany: async () => [] },
      prescriptionRequest: { findMany: async () => [] },
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
          whatsappEnabled: true,
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({ id: "assignment_1" }),
      },
      serviceRequest: { findMany: async () => [] },
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
            whatsappEnabled: true,
          },
          serviceCommerceStoreTeamAssignments: [{ id: "assignment_1" }],
          serviceRequestForms: [],
          storeConversationAvailabilityConfiguration: null,
          storeConversationChannelConfiguration: {
            desiredMode: "BOTH",
            revision: 1,
          },
          tenant: { timezone: "Africa/Lagos" },
          whatsappStoreBindings: [
            {
              connection: {
                businessVerified: true,
                numberVerified: true,
                outboundVerified: true,
                status: "ACTIVE",
                templatesReady: true,
                tenantId: "tenant_1",
                webhookSubscribed: true,
              },
              status: "ACTIVE",
              tenantId: "tenant_1",
            },
          ],
        }),
      },
      storeConversation: {
        findFirst: async ({ select }: { select?: Record<string, unknown> }) =>
          select?.lastMessageSequence
            ? { lastMessageSequence: 0 }
            : { id: "conversation_1" },
        updateMany: async () => ({ count: 1 }),
      },
      storeConversationMessage: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: "message_new",
        }),
      },
      storeConversationRequestLink: { findMany: async () => [] },
      storeConversationWhatsAppBridge: {
        findMany: async () => [oldBridge],
        updateMany: async ({ data, where }: Record<string, unknown>) => {
          updates.push({
            model: "bridge",
            value: { data, where },
          })
          return { count: 1 }
        },
        upsert: async () => ({
          ...bridgeRecord({ revision: 1, status: "AWAITING_CHOICE" }),
          capabilityId: "capability_new",
          linkedMessageId: "message_new",
        }),
      },
      storeConversationWhatsAppBridgeAttempt: {
        create: async () => ({ id: "attempt_new" }),
        updateMany: async ({ data, where }: Record<string, unknown>) => {
          updates.push({ model: "attempt", value: { data, where } })
          return { count: 1 }
        },
      },
      storeConversationWhatsAppBridgeAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push({ model: "audit", value: data })
          return { id: "audit_new" }
        },
      },
      storeConversationWhatsAppBridgeCapability: {
        findUnique: async () => capability,
        update: async () => capability,
      },
      storeConversationWhatsAppBridgeChoiceCapability: {
        create: async () => ({ id: "choice_new" }),
        updateMany: async ({ data, where }: Record<string, unknown>) => {
          updates.push({ model: "choice", value: { data, where } })
          return { count: 1 }
        },
      },
      whatsAppStoreBinding: {
        findMany: async () => [
          {
            connection: {
              businessVerified: true,
              displayNumber: "+2348000000000",
              id: "connection_1",
              numberVerified: true,
              outboundVerified: true,
              phoneNumberId: "phone_1",
              status: "ACTIVE",
              templatesReady: true,
              tenantId: "tenant_1",
              webhookSubscribed: true,
            },
            connectionId: "connection_1",
            status: "ACTIVE",
            tenantId: "tenant_1",
          },
        ],
      },
    } as unknown as PrismaClient

    const result = await consumeStoreConversationWhatsAppBridge(client, {
      bridgeTokenDigest: digest,
      connectionId: "connection_1",
      externalCustomerIdCiphertext: "recipient_ciphertext",
      externalCustomerIdDigest: digest,
      now: new Date("2026-08-16T09:30:00Z"),
      tokenServices: {
        deriveChoiceToken: () => `ewb1_${"a".repeat(43)}`,
        digestToken: () => digest,
      },
    })

    expect(result).toMatchObject({
      bridgeId: "bridge_1",
      choices: ["start_new_request"],
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(updates).toContainEqual({
      model: "bridge",
      value: {
        data: {
          revokedAt: new Date("2026-08-16T09:30:00Z"),
          status: "REVOKED",
        },
        where: expect.objectContaining({
          connectionId: "connection_1",
          externalCustomerIdDigest: digest,
          tenantId: "tenant_1",
        }),
      },
    })
    expect(updates).toContainEqual({
      model: "attempt",
      value: expect.objectContaining({
        data: expect.objectContaining({
          failureCode: "bridge_superseded",
          status: "CANCELLED",
        }),
        where: expect.objectContaining({
          bridge: expect.objectContaining({
            connectionId: "connection_1",
            externalCustomerIdDigest: digest,
          }),
        }),
      }),
    })
    expect(updates).toContainEqual({
      model: "audit",
      value: expect.objectContaining({
        bridgeId: null,
        capabilityId: "capability_new",
        principalKind: "SYSTEM",
        reasonCode: "new_verified_bridge_superseded_route",
        type: "REVOKED",
      }),
    })
  })

  test("turns Start a new request into a durable typed-intake prompt", async () => {
    const db = createDb(
      bridgeRecord({ revision: 1, status: "AWAITING_CHOICE" }),
    )
    const result = await selectStoreConversationWhatsAppBridgeChoice(
      db.client,
      {
        choiceTokenDigest: digest,
        connectionId: "connection_1",
        externalCustomerIdDigest: digest,
        now: new Date("2026-08-16T09:15:00Z"),
      },
    )

    expect(result).toMatchObject({
      choice: "start_new_request",
      promptRequired: true,
    })
    expect(db.getBridge()).toMatchObject({
      choice: "START_NEW_REQUEST",
      revision: 2,
      status: "AWAITING_REQUEST_KIND",
    })
    expect(db.attempts).toEqual([
      {
        bridgeId: "bridge_1",
        bridgeRevision: 2,
        connectionId: "connection_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    ])
  })

  test("requires the explicit Product request choice before activating intake", async () => {
    const db = createDb(
      bridgeRecord({
        choice: "START_NEW_REQUEST",
        revision: 2,
        status: "AWAITING_REQUEST_KIND",
      }),
    )
    const selected = await selectStoreConversationWhatsAppBridgeRequestKind(
      db.client,
      {
        connectionId: "connection_1",
        externalCustomerIdDigest: digest,
        now: new Date("2026-08-16T09:16:00Z"),
        requestKind: "commerce_inquiry",
      },
    )

    expect(selected).toMatchObject({
      bridgeId: "bridge_1",
      requestKind: "commerce_inquiry",
    })
    expect(db.getBridge()).toMatchObject({ revision: 3, status: "ACTIVE" })
    expect(db.messages.at(-1)).toMatchObject({
      body: "Product request selected in WhatsApp.",
      channel: "WHATSAPP",
      kind: "SYSTEM_EVENT",
    })
  })

  test("rejects a choice made by a different WhatsApp recipient before writes", async () => {
    const db = createDb(
      bridgeRecord({ revision: 1, status: "AWAITING_CHOICE" }),
    )

    await expect(
      selectStoreConversationWhatsAppBridgeChoice(db.client, {
        choiceTokenDigest: digest,
        connectionId: "connection_1",
        externalCustomerIdDigest: "e".repeat(64),
        now: new Date("2026-08-16T09:15:00Z"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.attempts).toHaveLength(0)
    expect(db.audits).toHaveLength(0)
    expect(db.messages).toHaveLength(0)
  })

  test("fails closed when the recipient resolves to more than one durable Store bridge", async () => {
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationWhatsAppBridge: {
        findMany: async () => [
          bridgeRecord({ revision: 1, status: "ACTIVE" }),
          {
            ...bridgeRecord({ revision: 1, status: "ACTIVE" }),
            id: "bridge_2",
          },
        ],
      },
    } as unknown as PrismaClient

    await expect(
      resolveStoreConversationWhatsAppBridgeInboundRoute(client, {
        connectionId: "connection_1",
        externalCustomerIdDigest: digest,
      }),
    ).rejects.toBeInstanceOf(StoreConversationWhatsAppBridgeError)
  })

  test("lists only bounded identifier payloads for due prompt recovery", async () => {
    let captured: Record<string, unknown> | null = null
    const client = {
      storeConversationWhatsAppBridgeAttempt: {
        findMany: async (input: Record<string, unknown>) => {
          captured = input
          return [
            { bridgeId: "bridge_1", storeId: "store_1", tenantId: "tenant_1" },
          ]
        },
      },
    } as unknown as PrismaClient
    const result = await listDueStoreConversationWhatsAppBridgePrompts(client, {
      limit: 500,
      now: new Date("2026-08-16T09:20:00Z"),
    })

    expect(result).toEqual([
      { bridgeId: "bridge_1", storeId: "store_1", tenantId: "tenant_1" },
    ])
    expect(captured).toMatchObject({
      select: { bridgeId: true, storeId: true, tenantId: true },
      take: 100,
      where: { attemptCount: { lt: 3 } },
    })
    expect(JSON.stringify(captured)).not.toMatch(/ciphertext|recipient|token/i)
  })

  test("claims only the current bridge revision prompt", async () => {
    const capturedWheres: Record<string, unknown>[] = []
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationWhatsAppBridge: {
        findFirst: async () => ({ revision: 2 }),
      },
      storeConversationWhatsAppBridgeAttempt: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          capturedWheres.push(where)
          return null
        },
      },
    } as unknown as PrismaClient

    expect(
      await claimStoreConversationWhatsAppBridgePrompt(client, {
        bridgeId: "bridge_1",
        claimToken: "claim_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).toBeNull()
    expect(capturedWheres[0]).toEqual({
      bridgeId_bridgeRevision: {
        bridgeId: "bridge_1",
        bridgeRevision: 2,
      },
    })
  })
})
