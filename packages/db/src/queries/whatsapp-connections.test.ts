import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"
import {
  claimPrescriptionCommunicationIntent,
  claimWhatsAppInboundEvent,
  consumePrescriptionQuickAction,
  getPendingWhatsAppEmbeddedSignupSession,
  getWhatsAppEmbeddedSignupSession,
  materializePrescriptionQuoteReadyEffectsInTransaction,
  recordWhatsAppCommunicationStatus,
  recordWhatsAppConnectionTest,
  recordWhatsAppInboundEvent,
  resolveWhatsAppInboundConnection,
  resolveWhatsAppInboundStore,
  resolveWhatsAppStatusConnection,
  setWhatsAppConnectionLifecycle,
} from "./whatsapp-connections"

function blockedPharmacyWhatsAppPolicy() {
  return {
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    serviceCommercePolicyDecision: { findMany: async () => [] },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
  }
}

function whatsappChannelOnlyPolicy() {
  return {
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () =>
        allowedServiceCommercePolicyDecisionRows().filter(
          (decision) =>
            decision.channel === "WHATSAPP" &&
            decision.subject === "WHATSAPP" &&
            decision.vertical === "PHARMACY",
        ),
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
  }
}

describe("WhatsApp Embedded Signup session", () => {
  test("requires one unconsumed, unexpired, user-and-Store-scoped capability", async () => {
    const queries: unknown[] = []
    const db = {
      whatsAppEmbeddedSignupSession: {
        findFirst: async (query: unknown) => {
          queries.push(query)
          return {
            discoveredNumbers: [
              {
                businessDisplayName: "Pharmacy One",
                displayNumber: "+2348000000000",
                phoneNumberId: "phone-1",
                wabaId: "waba-1",
              },
            ],
            expiresAt: new Date("2026-08-09T12:00:00.000Z"),
          }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getWhatsAppEmbeddedSignupSession(db, {
        publicToken: "signup-token",
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      }),
    ).resolves.toMatchObject({
      numbers: [{ phoneNumberId: "phone-1", wabaId: "waba-1" }],
    })
    expect(queries[0]).toMatchObject({
      where: {
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        publicTokenDigest: expect.any(String),
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      },
    })
    expect(JSON.stringify(queries[0])).not.toContain("signup-token")
  })

  test("resolves the latest authenticated pending session without a URL bearer token", async () => {
    const queries: unknown[] = []
    const db = {
      whatsAppEmbeddedSignupSession: {
        findFirst: async (query: unknown) => {
          queries.push(query)
          return {
            discoveredNumbers: [
              {
                displayNumber: "+2348000000000",
                phoneNumberId: "phone-1",
                wabaId: "waba-1",
              },
            ],
            expiresAt: new Date("2026-08-09T12:00:00.000Z"),
          }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getPendingWhatsAppEmbeddedSignupSession(db, {
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      }),
    ).resolves.toMatchObject({ numbers: [{ phoneNumberId: "phone-1" }] })
    expect(queries[0]).toMatchObject({
      orderBy: { createdAt: "desc" },
      where: {
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      },
    })
    expect(JSON.stringify(queries[0])).not.toContain("publicToken")
  })
})

describe("WhatsApp inbound connection routing", () => {
  test("resolves a generic Store entry token with Service policy", async () => {
    const queries: unknown[] = []
    const transaction = {
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 2 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () =>
          allowedServiceCommercePolicyDecisionRows().filter(
            (decision) =>
              decision.channel === "WHATSAPP" &&
              (decision.subject === "WHATSAPP" ||
                decision.subject === "INTAKE") &&
              decision.vertical === "SERVICE",
          ),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: {
        findFirst: async (query: unknown) => {
          queries.push(query)
          return {
            store: {
              customerEntryPoint: {
                publicToken: "opaque-entry-token-123456789",
                status: "PUBLISHED",
              },
              prescriptionSettings: null,
              serviceCommerceProfile: {
                intakeEnabled: true,
                status: "ACTIVE",
                whatsappEnabled: true,
              },
            },
            storeId: "store-1",
            tenantId: "tenant-1",
          }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundStore(db, {
        channelToken: "opaque-entry-token-123456789",
        connectionId: "connection-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({ storeId: "store-1", tenantId: "tenant-1" })
    expect(queries[0]).toMatchObject({
      where: {
        store: {
          OR: expect.arrayContaining([
            {
              customerEntryPoint: {
                is: {
                  publicToken: "opaque-entry-token-123456789",
                  status: "PUBLISHED",
                },
              },
            },
          ]),
        },
      },
    })
  })

  test("returns an active generic Service Commerce Store without Pharmacy setup", async () => {
    const db = {
      whatsAppConnection: {
        findFirst: async () => ({
          bindings: [
            {
              store: {
                name: "Bag Store",
                prescriptionSettings: null,
                serviceCommerceProfile: {
                  intakeEnabled: true,
                  status: "ACTIVE",
                  whatsappEnabled: true,
                },
                tenantId: "tenant-1",
              },
              storeId: "store-1",
              tenantId: "tenant-1",
            },
          ],
          credentialReference: "credential-1",
          id: "connection-1",
          phoneNumberId: "phone-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundConnection(db, { phoneNumberId: "phone-1" }),
    ).resolves.toMatchObject({
      bindings: [{ storeId: "store-1", storeName: "Bag Store" }],
      requiresStoreSelection: false,
    })
  })

  test("rejects an unknown recipient before any Store or customer lookup", async () => {
    const queries: unknown[] = []
    const db = {
      whatsAppConnection: {
        findFirst: async (query: unknown) => {
          queries.push(query)
          return null
        },
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundConnection(db, { phoneNumberId: "unknown-phone" }),
    ).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND" })
    expect(queries).toEqual([
      expect.objectContaining({
        where: { phoneNumberId: "unknown-phone", status: "ACTIVE" },
      }),
    ])
  })

  test("returns every active same-Tenant branch and requires explicit Store selection", async () => {
    const db = {
      whatsAppConnection: {
        findFirst: async () => ({
          bindings: [
            {
              store: {
                name: "Central Pharmacy",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-1",
              },
              storeId: "store-1",
              tenantId: "tenant-1",
            },
            {
              store: {
                name: "Airport Branch",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-1",
              },
              storeId: "store-2",
              tenantId: "tenant-1",
            },
          ],
          credentialReference: "credential-1",
          id: "connection-1",
          phoneNumberId: "phone-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundConnection(db, { phoneNumberId: "phone-1" }),
    ).resolves.toMatchObject({
      bindings: [
        { storeId: "store-1", tenantId: "tenant-1" },
        { storeId: "store-2", tenantId: "tenant-1" },
      ],
      connectionId: "connection-1",
      phoneNumberId: "phone-1",
      requiresStoreSelection: true,
      tenantId: "tenant-1",
    })
  })

  test("fails the whole route when any active binding crosses the connection Tenant", async () => {
    const db = {
      whatsAppConnection: {
        findFirst: async () => ({
          bindings: [
            {
              store: {
                name: "Central Pharmacy",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-1",
              },
              storeId: "store-1",
              tenantId: "tenant-1",
            },
            {
              store: {
                name: "Other Pharmacy",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-2",
              },
              storeId: "store-2",
              tenantId: "tenant-2",
            },
          ],
          credentialReference: "credential-1",
          id: "connection-1",
          phoneNumberId: "phone-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundConnection(db, { phoneNumberId: "phone-1" }),
    ).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND" })
  })
})

describe("WhatsApp communication receipts", () => {
  test("records a read timestamp without crossing the connection/tenant scope", async () => {
    const updates: unknown[] = []
    const transaction = {
      $queryRaw: async () => [{ id: "attempt-1" }],
      prescriptionCommunicationAttempt: {
        findFirst: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              connectionId: "connection-1",
              intent: { tenantId: "tenant-1" },
              providerMessageId: "wamid.1",
            },
          })
          return { id: "attempt-1" }
        },
        findUnique: async () => ({
          deliveredAt: null,
          id: "attempt-1",
          readAt: null,
          status: "SENT",
        }),
        update: async (input: unknown) => {
          updates.push(input)
          return input
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient
    const occurredAt = new Date("2026-08-09T12:00:00.000Z")

    await recordWhatsAppCommunicationStatus(db, {
      connectionId: "connection-1",
      occurredAt,
      providerMessageId: "wamid.1",
      status: "read",
      tenantId: "tenant-1",
    })

    expect(updates[0]).toMatchObject({
      data: {
        deliveredAt: occurredAt,
        failureCode: null,
        readAt: occurredAt,
        status: "READ",
      },
      where: { id: "attempt-1" },
    })
  })

  test("does not regress a read receipt or overwrite its original timestamp", async () => {
    const updates: unknown[] = []
    const readAt = new Date("2026-08-09T12:00:00.000Z")
    const transaction = {
      $queryRaw: async () => [{ id: "attempt-1" }],
      prescriptionCommunicationAttempt: {
        findFirst: async () => ({ id: "attempt-1" }),
        findUnique: async () => ({
          deliveredAt: readAt,
          id: "attempt-1",
          readAt,
          status: "READ",
        }),
        update: async (input: unknown) => {
          updates.push(input)
          return input
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    const result = await recordWhatsAppCommunicationStatus(db, {
      connectionId: "connection-1",
      occurredAt: new Date("2026-08-09T12:01:00.000Z"),
      providerMessageId: "wamid.1",
      status: "delivered",
      tenantId: "tenant-1",
    })

    expect(result).toMatchObject({ readAt, status: "READ" })
    expect(updates).toHaveLength(0)
  })

  test("resolves late receipts by immutable attempt identity, not active binding state", async () => {
    const db = {
      prescriptionCommunicationAttempt: {
        findFirst: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              connection: { phoneNumberId: "phone-1" },
              providerMessageId: "wamid.late",
            },
          })
          return {
            connectionId: "suspended-connection",
            intent: { tenantId: "tenant-1" },
          }
        },
      },
    } as unknown as PrismaClient

    expect(
      await resolveWhatsAppStatusConnection(db, {
        phoneNumberId: "phone-1",
        providerMessageId: "wamid.late",
      }),
    ).toEqual({
      connectionId: "suspended-connection",
      kind: "prescription",
      tenantId: "tenant-1",
    })
  })

  test("resolves generic customer notification receipts by immutable provider connection", async () => {
    const db = {
      prescriptionCommunicationAttempt: { findFirst: async () => null },
      serviceCommerceCustomerNotificationAttempt: {
        findFirst: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              providerConnectionId: "connection-1",
              providerOperationId: "wamid.customer-action",
              tenantId: "tenant-1",
            },
          })
          return {
            notificationIntentId: "intent-1",
            storeId: "store-1",
            store: { currencyCode: "NGN", tenantId: "tenant-1" },
            tenantId: "tenant-1",
          }
        },
      },
      whatsAppConnection: {
        findUnique: async () => ({
          billingOwner: "BUSINESS",
          id: "connection-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    expect(
      await resolveWhatsAppStatusConnection(db, {
        phoneNumberId: "phone-1",
        providerMessageId: "wamid.customer-action",
      }),
    ).toEqual({
      billingOwnerSnapshot: "BUSINESS",
      connectionId: "connection-1",
      currencyCode: "NGN",
      intentId: "intent-1",
      kind: "service_commerce",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("rejects a customer receipt whose resolved Store crosses the connection Tenant", async () => {
    const db = {
      prescriptionCommunicationAttempt: { findFirst: async () => null },
      serviceCommerceCustomerNotificationAttempt: {
        findFirst: async () => ({
          notificationIntentId: "intent-1",
          storeId: "store-foreign",
          store: { currencyCode: "USD", tenantId: "tenant-foreign" },
          tenantId: "tenant-1",
        }),
      },
      whatsAppConnection: {
        findUnique: async () => ({
          billingOwner: null,
          id: "connection-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppStatusConnection(db, {
        phoneNumberId: "phone-1",
        providerMessageId: "wamid.customer-action",
      }),
    ).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND" })
  })
})

describe("WhatsApp failure controls", () => {
  test("atomically promotes a ready pending credential while retaining the active route", async () => {
    const updates: Array<{ data: Record<string, unknown>; where: unknown }> = []
    const transaction = {
      whatsAppConnection: {
        findFirstOrThrow: async () => ({
          credentialReference: "active-credential",
          id: "connection-1",
          pendingCredentialReference: "pending-credential",
          status: "ACTIVE",
        }),
        update: async (input: {
          data: Record<string, unknown>
          where: unknown
        }) => {
          updates.push(input)
          return { id: "connection-1" }
        },
      },
      whatsAppConnectionAuditEvent: { create: async () => ({ id: "audit-1" }) },
      whatsAppStoreBinding: { findMany: async () => [] },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await recordWhatsAppConnectionTest(db, {
      businessVerified: true,
      connectionId: "connection-1",
      displayNumber: "+2348000000000",
      numberVerified: true,
      outboundVerified: true,
      templateConfiguration: {},
      templatesReady: true,
      tenantId: "tenant-1",
      webhookSubscribed: true,
    })

    expect(updates).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          credentialReference: "pending-credential",
          pendingCredentialReference: null,
          status: "ACTIVE",
        }),
        where: { id: "connection-1", tenantId: "tenant-1" },
      }),
    ])
  })

  test("keeps the active credential and pending rotation retryable after a failed provider test", async () => {
    const updates: Array<{ data: Record<string, unknown>; where: unknown }> = []
    const transaction = {
      whatsAppConnection: {
        findFirstOrThrow: async () => ({
          credentialReference: "active-credential",
          id: "connection-1",
          pendingCredentialReference: "pending-credential",
          status: "ACTIVE",
        }),
        update: async (input: {
          data: Record<string, unknown>
          where: unknown
        }) => {
          updates.push(input)
          return { id: "connection-1" }
        },
      },
      whatsAppConnectionAuditEvent: { create: async () => ({ id: "audit-1" }) },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await recordWhatsAppConnectionTest(db, {
      businessVerified: false,
      connectionId: "connection-1",
      displayNumber: "+2348111111111",
      failureCode: "connection_test_failed",
      numberVerified: false,
      outboundVerified: false,
      templateConfiguration: {},
      templatesReady: false,
      tenantId: "tenant-1",
      webhookSubscribed: false,
    })

    expect(updates).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          credentialReference: undefined,
          lastTestFailureCode: "connection_test_failed",
          pendingCredentialReference: undefined,
          status: "ACTIVE",
        }),
        where: { id: "connection-1", tenantId: "tenant-1" },
      }),
    ])
  })

  test("activates a technically ready generic Service binding without Pharmacy templates or settings", async () => {
    let bindingActivations = 0
    let pharmacyChannelWrites = 0
    const transaction = {
      prescriptionChannel: {
        updateMany: async () => {
          pharmacyChannelWrites += 1
          return { count: 0 }
        },
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 2 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () =>
          allowedServiceCommercePolicyDecisionRows().filter(
            (decision) =>
              decision.channel === "WHATSAPP" &&
              (decision.subject === "WHATSAPP" ||
                decision.subject === "INTAKE") &&
              decision.vertical === "SERVICE",
          ),
      },
      store: {
        findFirst: async () => ({
          countryCode: "NG",
          prescriptionSettings: null,
          serviceCommerceProfile: {
            intakeEnabled: true,
            status: "ACTIVE",
            whatsappEnabled: true,
          },
        }),
      },
      whatsAppConnection: {
        findFirstOrThrow: async () => ({
          id: "connection-1",
          pendingCredentialReference: null,
          status: "DRAFT",
        }),
        update: async () => ({ id: "connection-1", status: "ACTIVE" }),
      },
      whatsAppConnectionAuditEvent: { create: async () => ({ id: "audit-1" }) },
      whatsAppStoreBinding: {
        findMany: async (input: {
          where: { status: "ACTIVE" | "PENDING" }
        }) =>
          input.where.status === "PENDING"
            ? [{ id: "binding-1", storeId: "store-1" }]
            : [{ storeId: "store-1" }],
        updateMany: async (input: {
          where: { id?: string | { not: string } }
        }) => {
          if (input.where.id === "binding-1") bindingActivations += 1
          return { count: input.where.id === "binding-1" ? 1 : 0 }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await recordWhatsAppConnectionTest(db, {
      businessVerified: true,
      connectionId: "connection-1",
      displayNumber: "+2348000000000",
      numberVerified: true,
      outboundVerified: true,
      templatesReady: false,
      templateConfiguration: {},
      tenantId: "tenant-1",
      webhookSubscribed: true,
    })

    expect(bindingActivations).toBe(1)
    expect(pharmacyChannelWrites).toBe(0)
  })

  test("does not activate a technically ready Pharmacy binding without intake policy", async () => {
    let bindingActivations = 0
    let channelStoreIds: string[] = []
    const transaction = {
      ...whatsappChannelOnlyPolicy(),
      prescriptionChannel: {
        updateMany: async (input: {
          where: { storeId: { in: string[] } }
        }) => {
          channelStoreIds = input.where.storeId.in
          return { count: input.where.storeId.in.length }
        },
      },
      whatsAppConnection: {
        findFirstOrThrow: async () => ({
          id: "connection-1",
          pendingCredentialReference: null,
          status: "DRAFT",
        }),
        update: async () => ({ id: "connection-1", status: "ACTIVE" }),
      },
      whatsAppConnectionAuditEvent: { create: async () => ({ id: "audit-1" }) },
      whatsAppStoreBinding: {
        findMany: async (input: {
          where: { status: "ACTIVE" | "PENDING" }
        }) =>
          input.where.status === "PENDING"
            ? [{ id: "binding-1", storeId: "store-1" }]
            : [],
        updateMany: async (input: {
          where: { id?: string | { not: string } }
        }) => {
          if (input.where.id === "binding-1") bindingActivations += 1
          return { count: input.where.id === "binding-1" ? 1 : 0 }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await recordWhatsAppConnectionTest(db, {
      businessVerified: true,
      connectionId: "connection-1",
      displayNumber: "+2348000000000",
      numberVerified: true,
      outboundVerified: true,
      templatesReady: true,
      templateConfiguration: {},
      tenantId: "tenant-1",
      webhookSubscribed: true,
    })

    expect(bindingActivations).toBe(0)
    expect(channelStoreIds).toEqual([])
  })

  test("does not persist inbound customer content when Pharmacy WhatsApp policy is prohibited", async () => {
    let inboundWrites = 0
    const transaction = {
      ...blockedPharmacyWhatsAppPolicy(),
      whatsAppInboundEvent: {
        upsert: async () => {
          inboundWrites += 1
          return { id: "inbound-1" }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      recordWhatsAppInboundEvent(db, {
        connectionId: "connection-1",
        externalCustomerId: "customer-1",
        messageType: "text",
        normalizedPayload: { text: "private customer content" },
        providerEventId: "provider-event-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" })
    expect(inboundWrites).toBe(0)
  })

  test("persists a generic inbound event with its Service route instead of Pharmacy", async () => {
    let create: Record<string, unknown> | undefined
    const transaction = {
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () =>
          allowedServiceCommercePolicyDecisionRows().filter(
            (decision) =>
              decision.channel === "WHATSAPP" &&
              decision.subject === "INTAKE" &&
              decision.vertical === "SERVICE",
          ),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppInboundEvent: {
        upsert: async (input: { create: Record<string, unknown> }) => {
          create = input.create
          return { id: "inbound-service-1" }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await recordWhatsAppInboundEvent(db, {
      connectionId: "connection-1",
      externalCustomerId: "customer-1",
      messageType: "media",
      normalizedPayload: { mediaId: "provider-media-1" },
      providerEventId: "provider-event-service-1",
      routeVertical: "service",
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(create).toMatchObject({ routeVertical: "SERVICE" })
  })

  test("reuses one inbound row for a duplicate provider webhook", async () => {
    const upserts: Array<Record<string, unknown>> = []
    const transaction = {
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () =>
          allowedServiceCommercePolicyDecisionRows().filter(
            (decision) =>
              decision.channel === "WHATSAPP" &&
              decision.subject === "INTAKE" &&
              decision.vertical === "SERVICE",
          ),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppInboundEvent: {
        upsert: async (input: Record<string, unknown>) => {
          upserts.push(input)
          return { id: "inbound-service-1", status: "RECEIVED" }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient
    const input = {
      connectionId: "connection-1",
      externalCustomerId: "customer-1",
      messageType: "text",
      normalizedPayload: { text: "Is this available?" },
      providerEventId: "provider-event-replayed-1",
      routeVertical: "service" as const,
      storeId: "store-1",
      tenantId: "tenant-1",
    }

    const first = await recordWhatsAppInboundEvent(db, input)
    const replay = await recordWhatsAppInboundEvent(db, input)

    expect(replay.id).toBe(first.id)
    expect(upserts).toHaveLength(2)
    expect(upserts).toEqual(
      upserts.map(() =>
        expect.objectContaining({
          update: {},
          where: { providerEventId: "provider-event-replayed-1" },
        }),
      ),
    )
  })

  test("returns null when another worker already claimed the duplicate event", async () => {
    let bindingReads = 0
    const transaction = {
      whatsAppInboundEvent: {
        findUnique: async () => ({
          connection: {
            credentialReference: "credential-1",
            phoneNumberId: "phone-1",
            status: "ACTIVE",
            tenantId: "tenant-1",
          },
          connectionId: "connection-1",
          externalCustomerId: "customer-1",
          id: "inbound-1",
          messageType: "text",
          normalizedPayload: {},
          providerEventId: "provider-event-1",
          requestId: null,
          routeVertical: "SERVICE",
          status: "RECEIVED",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
        updateMany: async () => ({ count: 0 }),
      },
      whatsAppStoreBinding: {
        findFirst: async () => {
          bindingReads += 1
          return { id: "binding-1" }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      claimWhatsAppInboundEvent(db, { inboundEventId: "inbound-1" }),
    ).resolves.toBeNull()
    expect(bindingReads).toBe(0)
  })

  test("rechecks policy at inbound job claim and fails before processing", async () => {
    const updates: unknown[] = []
    const transaction = {
      ...blockedPharmacyWhatsAppPolicy(),
      whatsAppInboundEvent: {
        findUnique: async () => ({
          connection: {
            credentialReference: "credential-1",
            phoneNumberId: "phone-1",
            status: "ACTIVE",
            tenantId: "tenant-1",
          },
          connectionId: "connection-1",
          externalCustomerId: "customer-1",
          id: "inbound-1",
          messageType: "text",
          normalizedPayload: {},
          providerEventId: "provider-event-1",
          requestId: null,
          routeVertical: "PHARMACY",
          status: "RECEIVED",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
        update: async (input: unknown) => {
          updates.push(input)
          return input
        },
        updateMany: async () => ({ count: 1 }),
      },
      whatsAppStoreBinding: { findFirst: async () => ({ id: "binding-1" }) },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      claimWhatsAppInboundEvent(db, { inboundEventId: "inbound-1" }),
    ).resolves.toBeNull()
    expect(updates).toEqual([
      {
        data: {
          failureCode: "policy_restricted",
          processedAt: expect.any(Date),
          status: "FAILED",
        },
        where: { id: "inbound-1" },
      },
    ])
  })

  test("rechecks policy at outbound claim and defers without a provider attempt", async () => {
    const updates: unknown[] = []
    let attempts = 0
    const transaction = {
      ...blockedPharmacyWhatsAppPolicy(),
      prescriptionCommunicationAttempt: {
        count: async () => 0,
        create: async () => {
          attempts += 1
          return { id: "attempt-1" }
        },
      },
      prescriptionCommunicationIntent: {
        findUnique: async () => ({
          id: "intent-1",
          payload: {},
          recipientReference: "+2348000000000",
          status: "PENDING",
          storeId: "store-1",
          tenantId: "tenant-1",
          type: "QUOTE_READY",
        }),
        update: async (input: unknown) => {
          updates.push(input)
          return input
        },
      },
      whatsAppStoreBinding: {
        findFirst: async () => ({
          connection: {
            credentialReference: "credential-1",
            id: "connection-1",
            phoneNumberId: "phone-1",
            status: "ACTIVE",
            templateConfiguration: {},
          },
          connectionId: "connection-1",
          status: "ACTIVE",
        }),
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      claimPrescriptionCommunicationIntent(db, { intentId: "intent-1" }),
    ).resolves.toBeNull()
    expect(attempts).toBe(0)
    expect(updates).toEqual([
      {
        data: { status: "DEFERRED" },
        where: { id: "intent-1" },
      },
    ])
  })

  test("rejects a stale or already consumed quick action", async () => {
    const transaction = {
      prescriptionQuickAction: {
        findFirst: async () => null,
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      consumePrescriptionQuickAction(db, {
        actionId: "rx:expired-capability",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "QUICK_ACTION_INVALID" })
  })

  test("atomically materializes protected quote-ready actions and one intent", async () => {
    const actionWrites: Array<Record<string, unknown>> = []
    const intentWrites: Array<Record<string, unknown>> = []
    const rawActionIds: string[] = []
    const expiresAt = new Date("2030-01-01T00:00:00.000Z")
    const transaction = {
      ...whatsappChannelOnlyPolicy(),
      prescriptionCommunicationIntent: {
        findUnique: async () => null,
        upsert: async (input: { create: Record<string, unknown> }) => {
          intentWrites.push(input.create)
          return { id: "intent-1" }
        },
      },
      prescriptionQuickAction: {
        create: async (input: { data: Record<string, unknown> }) => {
          actionWrites.push(input.data)
          return { id: `action-${actionWrites.length}` }
        },
      },
      prescriptionRequest: {
        findFirst: async (input: { where: Record<string, unknown> }) => {
          expect(input.where).toEqual({
            id: "request-1",
            storeId: "store-1",
            tenantId: "tenant-1",
          })
          return { customerPhone: "+2348000000000", id: "request-1" }
        },
      },
    }

    const result = await materializePrescriptionQuoteReadyEffectsInTransaction(
      transaction as never,
      {
        expiresAt,
        protectActionId: (actionId) => {
          rawActionIds.push(actionId)
          return `protected-action-${rawActionIds.length}`
        },
        requestId: "request-1",
        storeId: "store-1",
        tenantId: "tenant-1",
        versionId: "version-1",
      },
    )

    expect(result).toEqual({ communicationIntentId: "intent-1" })
    expect(actionWrites).toHaveLength(3)
    expect(actionWrites.map((write) => write.action)).toEqual([
      "PICKUP",
      "DELIVERY",
      "ASK_PHARMACY",
    ])
    expect(
      actionWrites.every(
        (write) =>
          write.entityId === "version-1" &&
          write.entityType === "quote_version" &&
          write.expiresAt === expiresAt &&
          typeof write.tokenDigest === "string" &&
          write.tokenDigest.length === 64,
      ),
    ).toBe(true)
    expect(rawActionIds).toHaveLength(3)
    expect(rawActionIds.every((actionId) => actionId.startsWith("rx:"))).toBe(
      true,
    )
    expect(intentWrites).toEqual([
      {
        deduplicationKey: "quote-ready:version-1",
        orderId: undefined,
        payload: {
          actions: [
            { protectedId: "protected-action-1", title: "Pick up" },
            { protectedId: "protected-action-2", title: "Delivery" },
            { protectedId: "protected-action-3", title: "Ask pharmacy" },
          ],
        },
        recipientReference: "+2348000000000",
        requestId: "request-1",
        storeId: "store-1",
        tenantId: "tenant-1",
        type: "QUOTE_READY",
      },
    ])
    const durableWrites = JSON.stringify({ actionWrites, intentWrites })
    for (const rawActionId of rawActionIds) {
      expect(durableWrites).not.toContain(rawActionId)
      expect(durableWrites).not.toContain(rawActionId.slice(3))
    }
  })

  test("reuses an existing quote-ready intent without minting more capabilities", async () => {
    const transaction = {
      ...whatsappChannelOnlyPolicy(),
      prescriptionCommunicationIntent: {
        findUnique: async () => ({ id: "intent-1" }),
      },
      prescriptionRequest: {
        findFirst: async () => ({
          customerPhone: "+2348000000000",
          id: "request-1",
        }),
      },
    }

    await expect(
      materializePrescriptionQuoteReadyEffectsInTransaction(
        transaction as never,
        {
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          protectActionId: () => {
            throw new Error("A replay must not mint another action capability.")
          },
          requestId: "request-1",
          storeId: "store-1",
          tenantId: "tenant-1",
          versionId: "version-1",
        },
      ),
    ).resolves.toEqual({ communicationIntentId: "intent-1" })
  })

  test("keeps Quote release valid when WhatsApp notification policy is denied", async () => {
    const transaction = {
      ...blockedPharmacyWhatsAppPolicy(),
      prescriptionCommunicationIntent: {
        findUnique: async () => null,
      },
      prescriptionQuickAction: {
        create: async () => {
          throw new Error("Denied notification policy must not mint actions.")
        },
      },
      prescriptionRequest: {
        findFirst: async () => ({
          customerPhone: "+2348000000000",
          id: "request-1",
        }),
      },
    }

    await expect(
      materializePrescriptionQuoteReadyEffectsInTransaction(
        transaction as never,
        {
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          protectActionId: () => "protected-action",
          requestId: "request-1",
          storeId: "store-1",
          tenantId: "tenant-1",
          versionId: "version-1",
        },
      ),
    ).resolves.toEqual({ communicationIntentId: null })
  })

  test("revokes a credential by suspending only its Tenant bindings", async () => {
    const bindingUpdates: unknown[] = []
    const transaction = {
      whatsAppConnection: {
        update: async () => ({ id: "connection-1", status: "REVOKED" }),
      },
      whatsAppConnectionAuditEvent: {
        create: async (input: unknown) => input,
      },
      whatsAppStoreBinding: {
        updateMany: async (input: unknown) => {
          bindingUpdates.push(input)
          return { count: 2 }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await setWhatsAppConnectionLifecycle(db, {
      actorUserId: "user-1",
      connectionId: "connection-1",
      status: "revoked",
      tenantId: "tenant-1",
    })

    expect(bindingUpdates).toEqual([
      {
        data: { status: "SUSPENDED" },
        where: { connectionId: "connection-1", tenantId: "tenant-1" },
      },
    ])
  })
})
