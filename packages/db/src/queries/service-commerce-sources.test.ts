import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { CommerceInquiryStatus } from "../../generated/prisma/enums"
import {
  CommerceInquiryError,
  acceptCommerceInquiryQuote,
  assertCommerceInquiryTransition,
  createCommerceInquiry,
} from "./commerce-inquiries"
import {
  ServiceCommerceSourceError,
  getServiceCommerceCustomerRequestProjection,
} from "./service-commerce-sources"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function createProjectionDb(input?: {
  role?: string
  source?: "commerce_inquiry" | "prescription" | "service"
}) {
  const calls: Array<{ args: unknown; name: string }> = []
  const profile = {
    bookingEnabled: false,
    catalogAdoptionMode: "PROGRESSIVE",
    deliveryEnabled: false,
    id: "profile-1",
    intakeEnabled: true,
    paymentEnabled: true,
    pickupEnabled: false,
    policyRestrictedCapabilities: [],
    procureToOrderEnabled: false,
    progressiveCatalogEnabled: true,
    quoteEnabled: true,
    revision: 1,
    serviceCompletionEnabled: false,
    staffEnabled: true,
    status: "ACTIVE",
    webEnabled: false,
    whatsappEnabled: false,
  }
  const db = {
    commerceInquiry: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "commerceInquiry.findFirst" })
        return input?.source === "commerce_inquiry"
          ? { status: "READY_TO_QUOTE", summary: "Blue package" }
          : null
      },
    },
    membership: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "membership.findFirst" })
        return { role: input?.role ?? "OPERATOR" }
      },
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async (args: unknown) => {
        calls.push({ args, name: "policyAudit.createMany" })
        return { count: 1 }
      },
    },
    serviceCommercePolicyDecision: {
      findMany: async (args: unknown) => {
        calls.push({ args, name: "policyDecision.findMany" })
        return allowedServiceCommercePolicyDecisionRows()
      },
    },
    prescriptionRequest: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "prescriptionRequest.findFirst" })
        return input?.source === "prescription"
          ? {
              customerName: "must-not-project",
              media: [{ objectKey: "private-key" }],
              status: "PHARMACIST_REVIEW",
              transcript: "private transcript",
            }
          : null
      },
    },
    serviceRequest: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "serviceRequest.findFirst" })
        return input?.source === "service"
          ? { details: "must-not-project", status: "SUBMITTED" }
          : null
      },
    },
    stockBalanceSource: { findFirst: async () => null },
    store: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "store.findFirst" })
        return {
          countryCode: "NG",
          id: "store-1",
          name: "Main Store",
          serviceCommerceProfile: profile,
          status: "ACTIVE",
        }
      },
    },
    whatsAppStoreBinding: { findMany: async () => [] },
  }
  return { calls, db: db as unknown as PrismaClient }
}

describe("Service Commerce source interoperability", () => {
  test("authorizes before loading and scopes every source by Tenant and Store", async () => {
    const fake = createProjectionDb({ source: "service" })
    const projection = await getServiceCommerceCustomerRequestProjection(
      fake.db,
      {
        actorUserId: "user-1",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    )
    const membershipIndex = fake.calls.findIndex(
      (entry) => entry.name === "membership.findFirst",
    )
    const sourceIndex = fake.calls.findIndex(
      (entry) => entry.name === "serviceRequest.findFirst",
    )
    expect(membershipIndex).toBeGreaterThanOrEqual(0)
    expect(sourceIndex).toBeGreaterThan(membershipIndex)
    expect(fake.calls[sourceIndex]?.args).toMatchObject({
      where: {
        id: "request-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    })
    expect(projection).toMatchObject({
      source: { id: "request-1", kind: "service" },
      state: "received",
      store: { id: "store-1", name: "Main Store" },
      summary: "Service request",
    })
  })

  test("does not load a source for an unauthorized actor", async () => {
    const fake = createProjectionDb({ role: "MEMBER", source: "service" })
    await expect(
      getServiceCommerceCustomerRequestProjection(fake.db, {
        actorUserId: "user-1",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceSourceError)
    expect(
      fake.calls.some((entry) => entry.name === "serviceRequest.findFirst"),
    ).toBe(false)
  })

  test("projects Prescription state without private clinical data", async () => {
    const fake = createProjectionDb({ source: "prescription" })
    const projection = await getServiceCommerceCustomerRequestProjection(
      fake.db,
      {
        actorUserId: "user-1",
        source: { id: "prescription-1", kind: "prescription" },
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    )
    expect(projection).toMatchObject({
      source: { kind: "prescription" },
      state: "received",
      summary: "Prescription request",
    })
    expect(JSON.stringify(projection)).not.toContain("private")
    expect(JSON.stringify(projection)).not.toContain("customerName")
  })

  test("fails closed for a stale or cross-scope source", async () => {
    const fake = createProjectionDb()
    await expect(
      getServiceCommerceCustomerRequestProjection(fake.db, {
        actorUserId: "user-1",
        source: { id: "missing", kind: "commerce_inquiry" },
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("does not create an Inquiry for exact Product demand", async () => {
    let transactionCalled = false
    const db = {
      $transaction: async () => {
        transactionCalled = true
      },
    } as unknown as PrismaClient
    await expect(
      createCommerceInquiry(db, {
        actorUserId: "user-1",
        channelOrigin: "staff",
        clientInquiryId: "inquiry-1",
        customerName: "Customer",
        demand: {
          command: "create_commercial_order",
          kind: "exact_product",
        },
        lines: [],
        storeId: "store-1",
        summary: "Known Product",
        tenantId: "tenant-1",
        vertical: "service",
      }),
    ).rejects.toBeInstanceOf(CommerceInquiryError)
    expect(transactionCalled).toBe(false)
  })

  test("reserves quoted and converted states for Quote commands", () => {
    expect(() =>
      assertCommerceInquiryTransition({
        from: CommerceInquiryStatus.RECEIVED,
        to: CommerceInquiryStatus.READY_TO_QUOTE,
      }),
    ).not.toThrow()
    expect(() =>
      assertCommerceInquiryTransition({
        from: CommerceInquiryStatus.READY_TO_QUOTE,
        to: CommerceInquiryStatus.CONVERTED,
      }),
    ).toThrow("state transition is unavailable")
    expect(() =>
      assertCommerceInquiryTransition({
        from: CommerceInquiryStatus.READY_TO_QUOTE,
        to: CommerceInquiryStatus.QUOTED,
      }),
    ).toThrow("state transition is unavailable")
  })

  test("rejects an accepted non-Inquiry Quote before replaying its Order", async () => {
    let reads = 0
    const client = {
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client as unknown as PrismaClient),
      commerceQuoteVersion: {
        findFirst: async () => {
          reads += 1
          return reads === 1
            ? { id: "version-1" }
            : {
                acceptanceClientId: "acceptance-1",
                acceptedOrderId: "service-order-1",
                id: "version-1",
                quote: {
                  currentVersionId: "version-1",
                  sourceType: "SERVICE_REQUEST",
                },
                status: "ACCEPTED",
              }
        },
      },
    } as unknown as PrismaClient

    await expect(
      acceptCommerceInquiryQuote(client, {
        acceptanceToken: "service-quote-token",
        clientAcceptanceId: "acceptance-1",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
  })

  test("reauthorizes and replays an accepted Inquiry after its source is converted", async () => {
    let versionReads = 0
    const client = {
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client as unknown as PrismaClient),
      commerceInquiry: {
        findFirst: async () => ({ status: "CONVERTED", vertical: "SERVICE" }),
      },
      commerceQuoteVersion: {
        findFirst: async () => {
          versionReads += 1
          return versionReads === 1
            ? { id: "version-1" }
            : {
                acceptanceClientId: "acceptance-1",
                acceptedOrderId: "order-1",
                id: "version-1",
                lines: [],
                quote: {
                  currentVersionId: "version-1",
                  sourceId: "inquiry-1",
                  sourceType: "COMMERCE_INQUIRY",
                  storeId: "store-1",
                  tenantId: "tenant-1",
                },
                status: "ACCEPTED",
              }
        },
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    } as unknown as PrismaClient

    await expect(
      acceptCommerceInquiryQuote(client, {
        acceptanceToken: "inquiry-quote-token",
        clientAcceptanceId: "acceptance-1",
      }),
    ).resolves.toEqual({ orderId: "order-1" })
  })
})
