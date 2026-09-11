import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceCustomerActionError,
  executeServiceCommerceCustomerAction,
  getPublicServiceCommerceCustomerAction,
  issueServiceCommerceCustomerActions,
  listDueServiceCommerceCustomerNotificationIntents,
  recordServiceCommerceCustomerNotificationReceipt,
  resolveCustomerActionWhatsAppConnectionInTransaction,
} from "./service-commerce-actions"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const now = new Date("2031-02-03T08:00:00.000Z")
const expiresAt = new Date("2031-02-04T08:00:00.000Z")

function tokenFor(input: { clientCapabilityId: string }) {
  return `action-token:${input.clientCapabilityId}`
}

function createActionDb(input?: {
  bookingConfigured?: boolean
  prescriptionCommerceStatus?: string
}) {
  const calls: Array<{ args: unknown; name: string }> = []
  const capabilities: Array<
    Record<string, unknown> & {
      clientCapabilityId: string
      id: string
      tenantId: string
      tokenDigest: string
    }
  > = []
  const executions: Array<
    Record<string, unknown> & {
      capabilityId: string
      clientOperationId: string
      payloadHash: string
      resultKind: string
    }
  > = []
  let sourceStatus = "QUOTED"
  const profile = {
    bookingEnabled: input?.bookingConfigured ?? false,
    catalogAdoptionMode: "PROGRESSIVE",
    deliveryEnabled: false,
    id: "profile-1",
    intakeEnabled: true,
    paymentEnabled: true,
    pickupEnabled: true,
    policyRestrictedCapabilities: [],
    procureToOrderEnabled: false,
    progressiveCatalogEnabled: true,
    quoteEnabled: true,
    revision: 1,
    serviceCompletionEnabled: false,
    staffEnabled: true,
    status: "ACTIVE",
    webEnabled: true,
    whatsappEnabled: false,
  }
  const tx = {
    $queryRaw: async () => [{ id: "capability-1" }],
    commerceQuote: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "commerceQuote.findFirst" })
        return {
          currentVersion: {
            acceptedOrder: null,
            currencyCode: "NGN",
            expiresAt,
            fulfilmentType: "PICKUP",
            id: "quote-version-1",
            optionSelection: null,
            options: [
              {
                clientOptionId: "default",
                fulfilmentType: "PICKUP",
                id: "option-1",
                label: "Available items",
                totalMinor: 20_000,
              },
            ],
            revokedAt: null,
            status: "ISSUED",
            totalMinor: 20_000,
            version: 1,
          },
        }
      },
    },
    customerEntryPoint: {
      findFirst: async () => ({
        id: "entry-1",
        publicToken: "customer-entry-token-1234567890",
        revision: 2,
      }),
    },
    membership: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "membership.findFirst" })
        return { role: "OWNER" }
      },
    },
    serviceBooking: { findFirst: async () => null },
    serviceBookingOfferingConfig: {
      findFirst: async () =>
        input?.bookingConfigured
          ? { id: "booking-config-1", revision: 3 }
          : null,
    },
    serviceCommerceCustomerActionCapability: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          consumedAt: null,
          createdAt: now,
          id: `capability-${capabilities.length + 1}`,
          status: "ACTIVE",
          updatedAt: now,
          ...data,
          amountMinor: data.amountMinor ?? null,
          clientCapabilityId: String(data.clientCapabilityId),
          currencyCode: data.currencyCode ?? null,
          targetOptionId: data.targetOptionId ?? null,
          tenantId: String(data.tenantId),
          tokenDigest: String(data.tokenDigest),
        }
        capabilities.push(row)
        return row
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const criteria = where as {
          clientCapabilityId?: string
          tenantId?: string
          tokenDigest?: string
        }
        return (
          capabilities.find((row) =>
            criteria.clientCapabilityId
              ? row.clientCapabilityId === criteria.clientCapabilityId &&
                row.tenantId === criteria.tenantId
              : row.tokenDigest === criteria.tokenDigest,
          ) ?? null
        )
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>
        where: { id: string }
      }) => {
        const row = capabilities.find((item) => item.id === where.id)
        if (row) Object.assign(row, data)
        return { count: row ? 1 : 0 }
      },
    },
    serviceCommerceCustomerActionExecution: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `execution-${executions.length + 1}`,
          ...data,
          capabilityId: String(data.capabilityId),
          clientOperationId: String(data.clientOperationId),
          payloadHash: String(data.payloadHash),
          resultKind: String(data.resultKind),
        }
        executions.push(row)
        return row
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        executions.find(
          (row) =>
            row.capabilityId === where.capabilityId &&
            row.clientOperationId === where.clientOperationId,
        ) ?? null,
    },
    serviceCommerceCustomerNotificationIntent: {
      create: async () => {
        throw new Error("web issuance must not create a notification intent")
      },
      findFirst: async () => null,
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    prescriptionRequest: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "prescriptionRequest.findFirst" })
        return {
          contactOptIn: true,
          currentMediaRevision: 2,
          currentTranscriptRevision: 3,
          customerEmail: null,
          customerPhone: "+2348000000000",
          pharmacistReviews: [
            {
              decision: "RELEASED",
              mediaRevision: 2,
              transcriptRevision: 3,
            },
          ],
          status: "CONVERTED",
          updatedAt: now,
        }
      },
    },
    prescriptionStoreSettings: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "prescriptionStoreSettings.findFirst" })
        return {
          deliveryEnabled: false,
          pickupEnabled: true,
          status: input?.prescriptionCommerceStatus ?? "ACTIVE",
        }
      },
    },
    serviceRequest: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "serviceRequest.findFirst" })
        return {
          contactOptIn: true,
          customerEmail: null,
          customerPhone: "+2348000000000",
          status: sourceStatus,
          updatedAt: now,
        }
      },
    },
    stockBalanceSource: { findFirst: async () => null },
    store: {
      findFirst: async () => ({
        countryCode: "NG",
        id: "store-1",
        name: "Main Store",
        serviceCommerceProfile: profile,
        status: "ACTIVE",
      }),
    },
    whatsAppStoreBinding: { findMany: async () => [] },
  }
  const db = {
    ...tx,
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaClient
  return {
    calls,
    capabilities,
    db,
    executions,
    setSourceStatus(value: string) {
      sourceStatus = value
    },
  }
}

describe("Service Commerce customer action repository", () => {
  test("records a scoped Direct Meta receipt against the generic notification intent", async () => {
    const writes: unknown[] = []
    const tx = {
      serviceCommerceCustomerNotificationIntent: {
        findFirst: async (input: unknown) => {
          writes.push(["find", input])
          return { id: "intent-1" }
        },
        updateMany: async (input: unknown) => {
          writes.push(["update", input])
          return { count: 1 }
        },
      },
      serviceCommerceCustomerNotificationReceipt: {
        upsert: async (input: unknown) => {
          writes.push(["receipt", input])
          return { id: "receipt-1" }
        },
      },
    }
    const db = {
      ...tx,
      $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient
    const occurredAt = new Date("2031-02-03T08:05:00.000Z")

    await recordServiceCommerceCustomerNotificationReceipt(db, {
      intentId: "intent-1",
      occurredAt,
      providerReceiptId: "wamid.1:read",
      status: "read",
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(writes).toContainEqual([
      "receipt",
      expect.objectContaining({
        create: expect.objectContaining({
          notificationIntentId: "intent-1",
          status: "READ",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      }),
    ])
    expect(writes).toContainEqual([
      "update",
      expect.objectContaining({
        data: { readAt: occurredAt, status: "READ" },
        where: {
          id: "intent-1",
          storeId: "store-1",
          tenantId: "tenant-1",
        },
      }),
    ])
  })

  test("lists only bounded due notification identifiers for durable recovery", async () => {
    const calls: unknown[] = []
    const now = new Date("2031-02-03T08:00:00.000Z")
    const result = await listDueServiceCommerceCustomerNotificationIntents(
      {
        serviceCommerceCustomerNotificationIntent: {
          fields: { maxAttempts: "max-attempts-field" },
          findMany: async (input: unknown) => {
            calls.push(input)
            return [
              {
                createdByUserId: "user-1",
                id: "intent-1",
                storeId: "store-1",
                tenantId: "tenant-1",
              },
            ]
          },
        },
      } as never,
      { limit: 500, now },
    )

    expect(result).toEqual([
      {
        actorUserId: "user-1",
        intentId: "intent-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    ])
    expect(calls).toEqual([
      expect.objectContaining({
        take: 200,
        where: expect.objectContaining({
          attemptCount: { lt: "max-attempts-field" },
          nextAttemptAt: { lte: now },
        }),
      }),
    ])
  })

  test("resolves exactly one active Store sender with the approved customer-action template", async () => {
    const connection =
      await resolveCustomerActionWhatsAppConnectionInTransaction(
        {
          whatsAppStoreBinding: {
            findMany: async () => [
              {
                connection: {
                  credentialReference: "protected-credential",
                  id: "connection-1",
                  phoneNumberId: "phone-number-1",
                  templateConfiguration: {
                    customer_actions: "ewatrade_customer_actions_available",
                  },
                },
              },
            ],
          },
        } as never,
        {
          storeId: "store-1",
          templateKey: "ewatrade_customer_actions_available",
          tenantId: "tenant-1",
        },
      )

    expect(connection).toEqual({
      connectionId: "connection-1",
      credentialReference: "protected-credential",
      phoneNumberId: "phone-number-1",
      templateKey: "ewatrade_customer_actions_available",
    })
  })

  test("fails ambiguous senders and missing approved templates closed", async () => {
    const input = {
      storeId: "store-1",
      templateKey: "ewatrade_customer_actions_available",
      tenantId: "tenant-1",
    }
    const binding = {
      connection: {
        credentialReference: "protected-credential",
        id: "connection-1",
        phoneNumberId: "phone-number-1",
        templateConfiguration: {},
      },
    }
    await expect(
      resolveCustomerActionWhatsAppConnectionInTransaction(
        {
          whatsAppStoreBinding: { findMany: async () => [binding, binding] },
        } as never,
        input,
      ),
    ).rejects.toMatchObject({ code: "ACTION_PROVIDER_UNAVAILABLE" })
    await expect(
      resolveCustomerActionWhatsAppConnectionInTransaction(
        {
          whatsAppStoreBinding: { findMany: async () => [binding] },
        } as never,
        input,
      ),
    ).rejects.toMatchObject({ code: "ACTION_PROVIDER_UNAVAILABLE" })
  })

  test("issues only current scoped actions and stores token digests, never bearer tokens", async () => {
    const fake = createActionDb()
    const { actions } = await issueServiceCommerceCustomerActions(fake.db, {
      actorUserId: "user-1",
      channel: "web",
      clientBatchId: "batch-1",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "service" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(actions.map((action) => action.action)).toEqual([
      "view_quote",
      "talk_to_staff",
    ])
    expect(fake.capabilities).toHaveLength(2)
    expect(JSON.stringify(fake.capabilities)).not.toContain("action-token:")
    expect(fake.calls).toContainEqual({
      args: expect.objectContaining({
        where: expect.objectContaining({
          id: "request-1",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      }),
      name: "serviceRequest.findFirst",
    })
  })

  test("keeps a current pharmacist release eligible for post-conversion shared actions", async () => {
    const fake = createActionDb()
    const { actions } = await issueServiceCommerceCustomerActions(fake.db, {
      actorUserId: "user-1",
      channel: "web",
      clientBatchId: "batch-prescription-converted",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "prescription" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(actions.map((action) => action.action)).toEqual([
      "view_quote",
      "pick_up",
      "talk_to_staff",
    ])
    expect(fake.calls).toContainEqual({
      args: expect.objectContaining({
        where: expect.objectContaining({
          id: "request-1",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      }),
      name: "prescriptionRequest.findFirst",
    })
  })

  test("keeps Pharmacy fulfilment unavailable when its vertical is inactive", async () => {
    const fake = createActionDb({ prescriptionCommerceStatus: "SUSPENDED" })
    const { actions } = await issueServiceCommerceCustomerActions(fake.db, {
      actorUserId: "user-1",
      channel: "web",
      clientBatchId: "batch-prescription-suspended",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "prescription" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(actions.map((action) => action.action)).toEqual([
      "view_quote",
      "talk_to_staff",
    ])
  })

  test("projects booking when the exact Service Offering configuration is active", async () => {
    const fake = createActionDb({ bookingConfigured: true })
    const { actions } = await issueServiceCommerceCustomerActions(fake.db, {
      actorUserId: "user-1",
      allowedActions: ["book"],
      channel: "web",
      clientBatchId: "batch-service-booking",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "service" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(actions.map((action) => action.action)).toEqual(["book"])
  })

  test("previews and consumes an action with payload-bound replay", async () => {
    const fake = createActionDb()
    const { actions } = await issueServiceCommerceCustomerActions(fake.db, {
      actorUserId: "user-1",
      channel: "web",
      clientBatchId: "batch-2",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "service" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    const action = actions[0]
    if (!action) throw new Error("expected action")

    await expect(
      getPublicServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        now,
      }),
    ).resolves.toMatchObject({ action: "view_quote", available: true })
    await expect(
      executeServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        clientOperationId: "operation-1",
        confirmed: false,
        now,
      }),
    ).resolves.toEqual({
      kind: "quote",
      replayed: false,
      sourceKind: "service",
    })
    await expect(
      executeServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        clientOperationId: "operation-1",
        confirmed: false,
        now,
      }),
    ).resolves.toEqual({
      kind: "quote",
      replayed: true,
      sourceKind: "service",
    })
    await expect(
      executeServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        clientOperationId: "operation-1",
        confirmed: true,
        now,
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceCustomerActionError)
    await expect(
      executeServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        clientOperationId: "operation-2",
        confirmed: false,
        now,
      }),
    ).rejects.toMatchObject({ code: "ACTION_CONFLICT" })
  })

  test("rotates a consumed capability when its action remains current", async () => {
    const fake = createActionDb()
    const input = {
      actorUserId: "user-1",
      channel: "web" as const,
      clientBatchId: "batch-consumed-recovery",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "service" as const },
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    const first = await issueServiceCommerceCustomerActions(fake.db, input)
    const original = first.actions.find(
      (action) => action.action === "view_quote",
    )
    if (!original) throw new Error("expected view Quote action")

    await executeServiceCommerceCustomerAction(fake.db, {
      capabilityToken: original.capabilityToken,
      clientOperationId: "operation-view-quote",
      confirmed: false,
      now,
    })
    await expect(
      getPublicServiceCommerceCustomerAction(fake.db, {
        capabilityToken: original.capabilityToken,
        now,
      }),
    ).resolves.toMatchObject({ available: false })

    const refreshed = await issueServiceCommerceCustomerActions(fake.db, input)
    const replacement = refreshed.actions.find(
      (action) => action.action === "view_quote",
    )
    if (!replacement) throw new Error("expected refreshed view Quote action")

    expect(replacement.capabilityToken).not.toBe(original.capabilityToken)
    await expect(
      getPublicServiceCommerceCustomerAction(fake.db, {
        capabilityToken: replacement.capabilityToken,
        now,
      }),
    ).resolves.toMatchObject({ action: "view_quote", available: true })
  })

  test("rotates a revoked capability only after current action revalidation", async () => {
    const fake = createActionDb()
    const input = {
      actorUserId: "user-1",
      allowedActions: ["talk_to_staff"] as const,
      channel: "web" as const,
      clientBatchId: "batch-revoked-recovery",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "service" as const },
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    const first = await issueServiceCommerceCustomerActions(fake.db, input)
    const original = first.actions[0]
    if (!original) throw new Error("expected support action")
    const stored = fake.capabilities.find(
      (capability) => capability.status === "ACTIVE",
    )
    if (!stored) throw new Error("expected stored capability")
    stored.status = "REVOKED"

    const refreshed = await issueServiceCommerceCustomerActions(fake.db, input)
    const replacement = refreshed.actions[0]
    if (!replacement) throw new Error("expected replacement support action")

    expect(replacement.capabilityToken).not.toBe(original.capabilityToken)
    await expect(
      getPublicServiceCommerceCustomerAction(fake.db, {
        capabilityToken: original.capabilityToken,
        now,
      }),
    ).resolves.toMatchObject({ available: false })
  })

  test("fails a stale source action closed with safe recovery", async () => {
    const fake = createActionDb()
    const { actions } = await issueServiceCommerceCustomerActions(fake.db, {
      actorUserId: "user-1",
      channel: "web",
      clientBatchId: "batch-3",
      expiresAt,
      issueCapabilityToken: tokenFor,
      now,
      source: { id: "request-1", kind: "service" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    const action = actions[0]
    if (!action) throw new Error("expected action")
    fake.setSourceStatus("DECLINED")

    await expect(
      getPublicServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        now,
      }),
    ).resolves.toEqual({
      available: false,
      recovery: "talk_to_staff",
      supportToken: "customer-entry-token-1234567890",
    })
    await expect(
      executeServiceCommerceCustomerAction(fake.db, {
        capabilityToken: action.capabilityToken,
        clientOperationId: "operation-stale",
        confirmed: false,
        now,
      }),
    ).rejects.toMatchObject({ code: "ACTION_CONFLICT" })
  })
})
