import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  getServiceCommerceReport,
  getServiceCommerceReportDrilldown,
  reconcileServiceCommerceUsageEvent,
  recordServiceCommerceUsageEvent,
  summarizeServiceCommerceCosts,
} from "./service-commerce-reporting"

const scope = {
  storeId: "store_1",
  tenantId: "tenant_1",
}

const window = {
  end: new Date("2031-03-01T00:00:00.000Z"),
  start: new Date("2031-02-01T00:00:00.000Z"),
}

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

function reportingClient(calls: Array<{ name: string; value: unknown }>) {
  function findMany(name: string, rows: unknown[] = []) {
    return async (value: unknown) => {
      calls.push({ name, value })
      return rows
    }
  }

  return dbClient({
    catalogAvailabilityAttestation: {
      findMany: findMany("catalogAvailabilityAttestation.findMany"),
    },
    catalogPricePromotion: {
      findMany: findMany("catalogPricePromotion.findMany"),
    },
    catalogSourceLineLink: {
      findMany: findMany("catalogSourceLineLink.findMany"),
    },
    commerceInquiry: {
      findMany: findMany("commerceInquiry.findMany"),
    },
    commerceQuoteLine: {
      findMany: findMany("commerceQuoteLine.findMany"),
    },
    commercialOrderPayment: {
      findMany: findMany("commercialOrderPayment.findMany", [
        {
          amountMinor: 25_000,
          recordedAt: new Date("2031-02-08T09:00:00.000Z"),
          storeId: scope.storeId,
          type: "PAYMENT",
        },
      ]),
    },
    commerceQuoteVersion: {
      findMany: findMany("commerceQuoteVersion.findMany", [
        {
          acceptedAt: new Date("2031-02-05T09:00:00.000Z"),
          declinedAt: null,
          issuedAt: new Date("2031-02-04T09:00:00.000Z"),
          quote: { sourceType: "SERVICE_REQUEST", storeId: scope.storeId },
          status: "ACCEPTED",
        },
        {
          acceptedAt: new Date("2031-02-06T09:00:00.000Z"),
          declinedAt: null,
          issuedAt: new Date("2031-01-31T09:00:00.000Z"),
          quote: { sourceType: "SERVICE_REQUEST", storeId: scope.storeId },
          status: "ACCEPTED",
        },
      ]),
    },
    prescriptionDeliveryEvent: {
      findMany: findMany("prescriptionDeliveryEvent.findMany"),
    },
    prescriptionPickupEvent: {
      findMany: findMany("prescriptionPickupEvent.findMany"),
    },
    prescriptionRequestAuditEvent: {
      findMany: findMany("prescriptionRequestAuditEvent.findMany"),
    },
    prescriptionUsageEvent: {
      findMany: findMany("prescriptionUsageEvent.findMany"),
    },
    serviceBooking: {
      findMany: findMany("serviceBooking.findMany", [
        {
          arrivedAt: null,
          completedAt: new Date("2031-02-10T11:00:00.000Z"),
          confirmedAt: new Date("2031-02-07T10:00:00.000Z"),
          serviceStartedAt: new Date("2031-02-10T10:00:00.000Z"),
          storeId: scope.storeId,
        },
        {
          arrivedAt: new Date("2031-02-11T10:00:00.000Z"),
          completedAt: new Date("2031-01-30T11:00:00.000Z"),
          confirmedAt: new Date("2031-01-28T10:00:00.000Z"),
          serviceStartedAt: new Date("2031-02-11T10:00:00.000Z"),
          storeId: scope.storeId,
        },
      ]),
    },
    serviceCommerceCustomerActionExecution: {
      findMany: findMany("serviceCommerceCustomerActionExecution.findMany"),
    },
    serviceCommerceCustomerNotificationAttempt: {
      findMany: findMany("serviceCommerceCustomerNotificationAttempt.findMany"),
    },
    serviceCommerceCustomerNotificationIntent: {
      findMany: findMany("serviceCommerceCustomerNotificationIntent.findMany"),
    },
    serviceCommerceCustomerNotificationReceipt: {
      findMany: findMany("serviceCommerceCustomerNotificationReceipt.findMany"),
    },
    serviceCommerceMediaAuditEvent: {
      findMany: findMany("serviceCommerceMediaAuditEvent.findMany", [
        {
          effectiveAt: new Date("2031-02-09T11:00:00.000Z"),
          lifecycle: "SAFE",
          type: "SAFETY_RECORDED",
        },
      ]),
    },
    serviceCommerceSourceAttachment: {
      findMany: findMany("serviceCommerceSourceAttachment.findMany"),
    },
    serviceCommerceStoreAuditEvent: {
      findMany: findMany("serviceCommerceStoreAuditEvent.findMany", [
        {
          effectiveAt: new Date("2031-02-09T08:00:00.000Z"),
          type: "ACTIVATED",
        },
      ]),
    },
    serviceCommerceVerifiedObservation: {
      findMany: findMany("serviceCommerceVerifiedObservation.findMany"),
    },
    serviceCommerceUsageEvent: {
      findMany: findMany("serviceCommerceUsageEvent.findMany", [
        {
          billingOwnerSnapshot: "tenant",
          bspCostMinor: null,
          connectionId: "connection_1",
          currencyCode: "NGN",
          eventType: "MESSAGE_DELIVERED",
          metaCostMinor: 19,
          messageCategory: "utility",
          occurredAt: new Date("2031-02-09T08:00:00.000Z"),
          recipientMarket: "NG",
        },
      ]),
    },
    serviceDeliveryAttempt: {
      findMany: findMany("serviceDeliveryAttempt.findMany", [
        {
          attemptedAt: new Date("2031-02-09T08:00:00.000Z"),
          completedAt: new Date("2031-02-09T08:00:00.000Z"),
          status: "SENT",
        },
      ]),
    },
    serviceRequest: {
      findMany: findMany("serviceRequest.findMany", [
        {
          channelOrigin: "WHATSAPP",
          convertedAt: new Date("2031-02-05T09:00:00.000Z"),
          requestedAt: new Date("2031-02-03T09:00:00.000Z"),
          storeId: scope.storeId,
        },
      ]),
    },
    serviceWorkEvent: {
      findMany: findMany("serviceWorkEvent.findMany"),
    },
    store: {
      findMany: findMany("store.findMany", [
        { id: scope.storeId, name: "Appointment Store" },
      ]),
    },
    tenant: {
      findFirstOrThrow: async (value: unknown) => {
        calls.push({ name: "tenant.findFirstOrThrow", value })
        return { currencyCode: "NGN" }
      },
    },
    whatsAppConnectionAuditEvent: {
      findMany: findMany("whatsAppConnectionAuditEvent.findMany", [
        {
          effectiveAt: new Date("2031-02-09T08:00:00.000Z"),
          type: "readiness_passed",
        },
      ]),
    },
    whatsAppRoutingAlert: {
      findMany: findMany("whatsAppRoutingAlert.findMany", [
        {
          createdAt: new Date("2031-02-09T08:00:00.000Z"),
          resolvedAt: new Date("2031-02-10T08:00:00.000Z"),
        },
      ]),
    },
  })
}

describe("Service Commerce reporting repository contract", () => {
  test("uses exact Tenant and Store scope plus half-open authoritative lifecycle windows", async () => {
    const calls: Array<{ name: string; value: unknown }> = []

    const report = await getServiceCommerceReport(reportingClient(calls), {
      ...scope,
      ...window,
    })
    expect(report).toMatchObject({ scope: { storeId: scope.storeId } })
    expect(report.lifecycle).toMatchObject({
      bookingsCompleted: 1,
      bookingsConfirmed: 1,
      quotesAccepted: 2,
      quotesIssued: 1,
    })
    expect(report.storeBreakdown).toEqual([
      expect.objectContaining({ completions: 1, quotesIssued: 1 }),
    ])

    const byName = Object.fromEntries(
      calls.map((call) => [call.name, call.value]),
    )
    const halfOpen = { gte: window.start, lt: window.end }

    expect(byName["tenant.findFirstOrThrow"]).toMatchObject({
      where: { id: scope.tenantId },
    })
    expect(byName["store.findMany"]).toMatchObject({
      where: { id: scope.storeId, tenantId: scope.tenantId },
    })
    expect(byName["serviceRequest.findMany"]).toMatchObject({
      where: { ...scope, requestedAt: halfOpen },
    })
    expect(byName["commerceQuoteVersion.findMany"]).toMatchObject({
      where: {
        OR: [
          { acceptedAt: halfOpen },
          { declinedAt: halfOpen },
          { issuedAt: halfOpen },
        ],
        quote: { is: scope },
      },
    })
    expect(byName["commercialOrderPayment.findMany"]).toMatchObject({
      where: { ...scope, recordedAt: halfOpen },
    })
    expect(byName["serviceBooking.findMany"]).toMatchObject({
      where: {
        ...scope,
        OR: [
          { arrivedAt: halfOpen },
          { completedAt: halfOpen },
          { confirmedAt: halfOpen },
          { serviceStartedAt: halfOpen },
        ],
      },
    })
    expect(byName["serviceDeliveryAttempt.findMany"]).toMatchObject({
      where: {
        notificationIntent: { is: scope },
        OR: [
          { completedAt: halfOpen },
          { attemptedAt: halfOpen, completedAt: null },
        ],
      },
    })
    expect(byName["serviceCommerceMediaAuditEvent.findMany"]).toMatchObject({
      where: { ...scope, effectiveAt: halfOpen },
    })
    expect(byName["serviceCommerceUsageEvent.findMany"]).toMatchObject({
      where: { ...scope, occurredAt: halfOpen },
    })
    expect(report.usageCostsByDimension).toEqual([
      expect.objectContaining({
        billingOwner: "tenant",
        connectionId: "connection_1",
        messageCategory: "utility",
        recipientMarket: "NG",
      }),
    ])
    for (const call of calls.filter((call) =>
      call.name.endsWith(".findMany"),
    )) {
      expect(call.value).toMatchObject({ take: 10_000 })
    }
  })

  test("keeps unavailable external costs unknown instead of silently reporting zero", () => {
    expect(
      summarizeServiceCommerceCosts([
        {
          bspCostMinor: null,
          deliveryCostMinor: 0,
          eventType: "DELIVERY_RECONCILED",
          metaCostMinor: null,
          numberCostMinor: 55,
          paymentProviderFeeMinor: null,
          platformChargeMinor: 100,
          revenueMinor: 25_000,
          taxMinor: 750,
        },
        {
          bspCostMinor: 12,
          deliveryCostMinor: null,
          eventType: "MESSAGE_DELIVERED",
          metaCostMinor: 19,
          numberCostMinor: null,
          paymentProviderFeeMinor: null,
          platformChargeMinor: null,
          revenueMinor: null,
          taxMinor: null,
        },
      ]),
    ).toMatchObject({
      bspCostMinor: { amountMinor: 12, observedCount: 1, unknownCount: 0 },
      deliveryCostMinor: { amountMinor: 0, observedCount: 1, unknownCount: 0 },
      metaCostMinor: { amountMinor: 19, observedCount: 1, unknownCount: 0 },
      numberCostMinor: { amountMinor: null, observedCount: 0, unknownCount: 0 },
      paymentProviderFeeMinor: {
        amountMinor: null,
        observedCount: 0,
        unknownCount: 0,
      },
      platformChargeMinor: {
        amountMinor: 100,
        observedCount: 1,
        unknownCount: 1,
      },
      revenueMinor: { amountMinor: null, observedCount: 0, unknownCount: 0 },
      subscriptionChargeMinor: {
        amountMinor: null,
        observedCount: 0,
        unknownCount: 0,
      },
      taxMinor: { amountMinor: null, observedCount: 0, unknownCount: 0 },
    })
  })

  test("uses immutable audit and alert occurrences for aggregate readiness and routing", async () => {
    const report = await getServiceCommerceReport(reportingClient([]), {
      ...window,
      tenantId: scope.tenantId,
    })

    expect(report.observability).toEqual(
      expect.arrayContaining([
        { count: 1, kind: "provider_attempt", outcome: "available" },
        { count: 2, kind: "readiness", outcome: "available" },
        { count: 1, kind: "routing", outcome: "failed" },
        { count: 1, kind: "routing", outcome: "recovered" },
      ]),
    )
  })

  test("writes immutable provider usage with a Tenant-scoped idempotency key", async () => {
    const calls: unknown[] = []
    const db = dbClient({
      store: { findFirst: async () => ({ id: scope.storeId }) },
      whatsAppConnection: {
        findFirst: async (value: unknown) => {
          calls.push(value)
          return { id: "connection_1" }
        },
      },
      serviceCommerceUsageEvent: {
        upsert: async (value: unknown) => {
          calls.push(value)
          return { id: "usage_1", ...(value as { create: object }).create }
        },
      },
    })

    const recorded = await recordServiceCommerceUsageEvent(db, {
      billingOwnerSnapshot: "tenant",
      bspCostMinor: 12,
      connectionId: "connection_1",
      currencyCode: "NGN",
      deduplicationKey: "meta:wamid_1:delivered",
      eventType: "message_delivered",
      messageCategory: "utility",
      occurredAt: new Date("2031-02-10T10:00:00.000Z"),
      providerKey: "meta",
      recipientMarket: "NG",
      sourceId: "request_1",
      sourceKind: "service",
      ...scope,
    })
    expect(recorded.id).toBe("usage_1")

    expect(calls).toEqual([
      expect.objectContaining({
        where: {
          id: "connection_1",
          bindings: {
            some: { storeId: scope.storeId, tenantId: scope.tenantId },
          },
          tenantId: scope.tenantId,
        },
      }),
      expect.objectContaining({
        create: expect.objectContaining({
          connectionId: "connection_1",
          deduplicationKey: "meta:wamid_1:delivered",
          eventType: "MESSAGE_DELIVERED",
          occurredAt: new Date("2031-02-10T10:00:00.000Z"),
          sourceId: "request_1",
          sourceKind: "SERVICE",
          ...scope,
        }),
        update: {},
        where: {
          tenantId_deduplicationKey: {
            deduplicationKey: "meta:wamid_1:delivered",
            tenantId: scope.tenantId,
          },
        },
      }),
    ])
  })

  test("fails closed when an idempotency key replays a different immutable usage event", async () => {
    const db = dbClient({
      store: { findFirst: async () => ({ id: scope.storeId }) },
      serviceCommerceUsageEvent: {
        upsert: async (value: unknown) => ({
          ...(value as { create: object }).create,
          id: "usage_1",
          sourceId: "a-different-source",
        }),
      },
    })

    await expect(
      recordServiceCommerceUsageEvent(db, {
        currencyCode: "NGN",
        deduplicationKey: "meta:wamid_1:delivered",
        eventType: "message_delivered",
        occurredAt: new Date("2031-02-10T10:00:00.000Z"),
        sourceId: "request_1",
        sourceKind: "service",
        ...scope,
      }),
    ).rejects.toThrow("SERVICE_COMMERCE_USAGE_DEDUPLICATION_CONFLICT")
  })

  test("rejects a cross-Tenant Store or Connection before recording usage", async () => {
    let writes = 0
    const db = dbClient({
      store: { findFirst: async () => ({ id: scope.storeId }) },
      whatsAppConnection: { findFirst: async () => null },
      serviceCommerceUsageEvent: {
        upsert: async () => {
          writes += 1
          return {}
        },
      },
    })

    await expect(
      recordServiceCommerceUsageEvent(db, {
        connectionId: "connection_other_tenant",
        currencyCode: "NGN",
        deduplicationKey: "meta:cross-tenant",
        eventType: "message_delivered",
        occurredAt: new Date("2031-02-10T10:00:00.000Z"),
        sourceId: "request_1",
        sourceKind: "service",
        ...scope,
      }),
    ).rejects.toThrow("SERVICE_COMMERCE_USAGE_SCOPE_MISMATCH")
    expect(writes).toBe(0)
  })

  test("reconciles one pending unknown-cost fact with exact Tenant, Store, and immutable identity checks", async () => {
    const occurredAt = new Date("2031-02-10T10:00:00.000Z")
    const reconciledAt = new Date("2031-02-11T10:00:00.000Z")
    const pending = {
      billingOwnerSnapshot: "tenant",
      bspCostMinor: null,
      connectionId: null,
      currencyCode: "NGN",
      deliveryCostMinor: null,
      eventType: "MESSAGE_DELIVERED",
      id: "usage_1",
      messageCategory: "utility",
      metaCostMinor: null,
      numberCostMinor: null,
      occurredAt,
      paymentProviderFeeMinor: null,
      platformChargeMinor: null,
      providerKey: "meta-cloud-api",
      recipientMarket: "NG",
      reconciliationSource: "meta_monthly_statement",
      reconciliationStatus: "PENDING",
      reconciledAt: null,
      revenueMinor: null,
      sourceId: "intent_1",
      sourceKind: "CUSTOMER_CHANNEL",
      storeId: scope.storeId,
      subscriptionChargeMinor: null,
      taxMinor: null,
      tenantId: scope.tenantId,
    }
    const reconciled = {
      ...pending,
      metaCostMinor: 19,
      reconciliationStatus: "RECONCILED",
      reconciledAt,
    }
    const calls: Array<{ name: string; value: unknown }> = []
    const db = dbClient({
      serviceCommerceUsageEvent: {
        findUnique: async (value: unknown) => {
          calls.push({ name: "findUnique", value })
          return pending
        },
        findUniqueOrThrow: async (value: unknown) => {
          calls.push({ name: "findUniqueOrThrow", value })
          return reconciled
        },
        updateMany: async (value: unknown) => {
          calls.push({ name: "updateMany", value })
          return { count: 1 }
        },
      },
      store: { findFirst: async () => ({ id: scope.storeId }) },
    })

    await expect(
      reconcileServiceCommerceUsageEvent(db, {
        billingOwnerSnapshot: "tenant",
        currencyCode: "NGN",
        deduplicationKey: "meta:wamid_1:delivered",
        eventType: "message_delivered",
        messageCategory: "utility",
        metaCostMinor: 19,
        occurredAt,
        providerKey: "meta-cloud-api",
        recipientMarket: "NG",
        reconciledAt,
        reconciliationSource: "meta_monthly_statement",
        sourceId: "intent_1",
        sourceKind: "customer_channel",
        ...scope,
      }),
    ).resolves.toMatchObject({
      id: "usage_1",
      metaCostMinor: 19,
      reconciliationStatus: "RECONCILED",
    })
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "updateMany",
          value: expect.objectContaining({
            data: expect.objectContaining({
              metaCostMinor: 19,
              reconciliationSource: "meta_monthly_statement",
              reconciliationStatus: "RECONCILED",
              reconciledAt,
            }),
            where: expect.objectContaining({
              id: "usage_1",
              reconciliationStatus: "PENDING",
              storeId: scope.storeId,
              tenantId: scope.tenantId,
            }),
          }),
        }),
      ]),
    )
  })

  test("returns an exact reconciliation replay without a second mutation", async () => {
    const occurredAt = new Date("2031-02-10T10:00:00.000Z")
    const reconciledAt = new Date("2031-02-11T10:00:00.000Z")
    let writes = 0
    const db = dbClient({
      serviceCommerceUsageEvent: {
        findUnique: async () => ({
          billingOwnerSnapshot: null,
          bspCostMinor: null,
          connectionId: null,
          currencyCode: "NGN",
          deliveryCostMinor: null,
          eventType: "MESSAGE_DELIVERED",
          id: "usage_1",
          messageCategory: null,
          metaCostMinor: 19,
          numberCostMinor: null,
          occurredAt,
          paymentProviderFeeMinor: null,
          platformChargeMinor: null,
          providerKey: "meta-cloud-api",
          recipientMarket: null,
          reconciliationSource: "meta_monthly_statement",
          reconciliationStatus: "RECONCILED",
          reconciledAt,
          revenueMinor: null,
          sourceId: "intent_1",
          sourceKind: "CUSTOMER_CHANNEL",
          storeId: scope.storeId,
          subscriptionChargeMinor: null,
          taxMinor: null,
          tenantId: scope.tenantId,
        }),
        updateMany: async () => {
          writes += 1
          return { count: 0 }
        },
      },
      store: { findFirst: async () => ({ id: scope.storeId }) },
    })

    await expect(
      reconcileServiceCommerceUsageEvent(db, {
        currencyCode: "NGN",
        deduplicationKey: "meta:wamid_1:delivered",
        eventType: "message_delivered",
        metaCostMinor: 19,
        occurredAt,
        providerKey: "meta-cloud-api",
        reconciledAt,
        reconciliationSource: "meta_monthly_statement",
        sourceId: "intent_1",
        sourceKind: "customer_channel",
        ...scope,
      }),
    ).resolves.toMatchObject({ id: "usage_1" })
    expect(writes).toBe(0)
  })

  test("rejects reconciliation identity, status, and authoritative payload mismatches", async () => {
    const occurredAt = new Date("2031-02-10T10:00:00.000Z")
    const reconciledAt = new Date("2031-02-11T10:00:00.000Z")
    const base = {
      billingOwnerSnapshot: null,
      bspCostMinor: null,
      connectionId: null,
      currencyCode: "NGN",
      deliveryCostMinor: null,
      eventType: "MESSAGE_DELIVERED",
      id: "usage_1",
      messageCategory: null,
      metaCostMinor: 0,
      numberCostMinor: null,
      occurredAt,
      paymentProviderFeeMinor: null,
      platformChargeMinor: null,
      providerKey: "meta-cloud-api",
      recipientMarket: null,
      reconciliationSource: "meta_monthly_statement",
      reconciliationStatus: "RECONCILED",
      reconciledAt,
      revenueMinor: null,
      sourceId: "intent_1",
      sourceKind: "CUSTOMER_CHANNEL",
      storeId: scope.storeId,
      subscriptionChargeMinor: null,
      taxMinor: null,
      tenantId: scope.tenantId,
    }
    const db = dbClient({
      serviceCommerceUsageEvent: { findUnique: async () => base },
      store: { findFirst: async () => ({ id: scope.storeId }) },
    })
    const input = {
      currencyCode: "NGN",
      deduplicationKey: "meta:wamid_1:delivered",
      eventType: "message_delivered" as const,
      metaCostMinor: 19,
      occurredAt,
      providerKey: "meta-cloud-api",
      reconciledAt,
      reconciliationSource: "meta_monthly_statement",
      sourceId: "intent_1",
      sourceKind: "customer_channel" as const,
      ...scope,
    }

    await expect(
      reconcileServiceCommerceUsageEvent(db, {
        ...input,
        sourceId: "different-intent",
      }),
    ).rejects.toThrow("SERVICE_COMMERCE_USAGE_RECONCILIATION_IDENTITY_MISMATCH")
    await expect(reconcileServiceCommerceUsageEvent(db, input)).rejects.toThrow(
      "SERVICE_COMMERCE_USAGE_RECONCILIATION_CONFLICT",
    )
    await expect(
      reconcileServiceCommerceUsageEvent(db, {
        ...input,
        metaCostMinor: -1,
      }),
    ).rejects.toThrow("metaCostMinor must be a non-negative")
  })

  test("returns a reporting drill-down that is role-gated and contains no customer, media, or provider operation secrets", async () => {
    const calls: Array<{ name: string; value: unknown }> = []
    const db = dbClient({
      membership: {
        findFirst: async (value: unknown) => {
          calls.push({ name: "membership.findFirst", value })
          return { id: "membership_1", role: "ADMIN" }
        },
      },
      serviceCommerceMediaAuditEvent: {
        findMany: async (value: unknown) => {
          calls.push({ name: "serviceCommerceMediaAuditEvent.findMany", value })
          return [
            {
              effectiveAt: new Date("2031-02-09T11:00:00.000Z"),
              lifecycle: "SAFE",
              type: "SAFETY_RECORDED",
            },
          ]
        },
      },
      serviceCommerceUsageEvent: {
        findMany: async (value: unknown) => {
          calls.push({ name: "serviceCommerceUsageEvent.findMany", value })
          return [
            {
              eventType: "MESSAGE_DELIVERED",
              occurredAt: new Date("2031-02-09T08:00:00.000Z"),
              providerKey: "meta",
            },
          ]
        },
      },
      serviceDeliveryAttempt: {
        findMany: async (value: unknown) => {
          calls.push({ name: "serviceDeliveryAttempt.findMany", value })
          return [
            {
              attemptedAt: new Date("2031-02-09T08:00:00.000Z"),
              completedAt: new Date("2031-02-09T08:00:00.000Z"),
              status: "SENT",
            },
          ]
        },
      },
    })

    const result = await getServiceCommerceReportDrilldown(db, {
      actorUserId: "admin_1",
      category: "reliability",
      ...scope,
      ...window,
    })

    expect(calls[0]).toMatchObject({
      name: "membership.findFirst",
      value: {
        where: {
          acceptedAt: { not: null },
          tenantId: scope.tenantId,
          userId: "admin_1",
        },
      },
    })
    expect(JSON.stringify(calls)).toContain('"storeId":"store_1"')
    expect(JSON.stringify(calls)).toContain('"occurredAt":{"gte"')

    const serialized = JSON.stringify(result)
    for (const forbidden of [
      "customerEmail",
      "customerName",
      "customerPhone",
      "objectKey",
      "providerAttemptId",
      "providerMediaId",
      "recipientCiphertext",
      "tokenDigest",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  test("returns aggregate lifecycle and catalog buckets instead of empty declared drill-downs", async () => {
    const rowSets: Record<string, unknown[]> = {
      catalogAvailabilityAttestation: [
        {
          createdAt: new Date("2031-02-06T10:00:00.000Z"),
          type: "MANUAL_PROCURE_TO_ORDER",
        },
      ],
      catalogPricePromotion: [
        {
          createdAt: new Date("2031-02-07T10:00:00.000Z"),
          previousPriceMinor: 2_000,
          priceMinor: 2_500,
        },
      ],
      catalogSourceLineLink: [
        {
          createdAt: new Date("2031-02-05T10:00:00.000Z"),
          offering: { status: "DRAFT" },
          sourceType: "COMMERCE_INQUIRY",
          verifiedObservationId: null,
        },
      ],
      commerceInquiry: [
        {
          channelOrigin: "WHATSAPP",
          createdAt: new Date("2031-02-02T10:00:00.000Z"),
        },
      ],
      commerceQuoteVersion: [
        {
          acceptedAt: new Date("2031-02-04T10:00:00.000Z"),
          declinedAt: null,
          issuedAt: new Date("2031-02-03T10:00:00.000Z"),
        },
      ],
      commercialOrderPayment: [
        { recordedAt: new Date("2031-02-05T10:00:00.000Z"), type: "PAYMENT" },
      ],
      serviceCommerceStoreAuditEvent: [
        { effectiveAt: new Date("2031-02-08T10:00:00.000Z") },
      ],
    }
    const db = new Proxy(
      {
        membership: {
          findFirst: async () => ({ id: "membership_1", role: "MANAGER" }),
        },
      },
      {
        get(target, property) {
          if (property in target) return target[property as keyof typeof target]
          return {
            findMany: async () => rowSets[String(property)] ?? [],
          }
        },
      },
    ) as unknown as PrismaClient

    const lifecycle = await getServiceCommerceReportDrilldown(db, {
      actorUserId: "manager_1",
      category: "lifecycle",
      ...scope,
      ...window,
    })
    const catalog = await getServiceCommerceReportDrilldown(db, {
      actorUserId: "manager_1",
      category: "catalog",
      ...scope,
      ...window,
    })

    expect(lifecycle.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "request_received", count: 1 }),
        expect.objectContaining({ category: "quote", outcome: "issued" }),
        expect.objectContaining({ category: "quote", outcome: "accepted" }),
        expect.objectContaining({ category: "payment", outcome: "succeeded" }),
      ]),
    )
    expect(catalog.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "catalog_resolution", count: 1 }),
        expect.objectContaining({
          category: "price_promotion",
          outcome: "reusable_price_promotion",
        }),
        expect.objectContaining({ category: "catalog", outcome: "graduated" }),
      ]),
    )
  })
})
