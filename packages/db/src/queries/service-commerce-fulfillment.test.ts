import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceFulfillmentError,
  assertServiceCommerceFulfillmentGatesInTransaction,
  getServiceCommerceFulfillmentOrder,
  reviseServiceCommerceQuoteForFulfillmentInTransaction,
} from "./service-commerce-fulfillment"

function fixture(overrides?: {
  attendant?: boolean
  paymentStatus?: string
  sourceId?: string
  sourceType?: string
}) {
  const calls: string[] = []
  const predicates: unknown[] = []
  const transaction = {
    commercialOrder: {
      findFirst: async (input: { where: unknown }) => {
        calls.push("order")
        predicates.push(input.where)
        return {
          acceptedCommerceQuoteVersion: {
            fulfilmentPromise: "Collect tomorrow",
            fulfilmentType: "PICKUP",
            id: "version-1",
            quote: {
              sourceId: overrides?.sourceId ?? "request-1",
              sourceType: overrides?.sourceType ?? "SERVICE_REQUEST",
            },
            status: "ACCEPTED",
            totalMinor: 20_000_00,
          },
          currencyCode: "NGN",
          id: "order-1",
          paymentStatus: overrides?.paymentStatus ?? "PAID",
          status: "CONFIRMED",
        }
      },
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async (input: { where: unknown }) => {
        calls.push("authorize")
        predicates.push(input.where)
        return overrides?.attendant === false ? null : { id: "assignment-1" }
      },
    },
  }
  return {
    db: {
      $transaction: async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    } as unknown as PrismaClient,
    calls,
    predicates,
    transaction,
  }
}

const context = {
  orderId: "order-1",
  source: { id: "request-1", kind: "service" as const },
  storeId: "store-1",
  tenantId: "tenant-1",
}

describe("Service Commerce fulfillment repository", () => {
  test("authorizes before resolving an exact Tenant, Store, Order and source", async () => {
    const { calls, db, predicates } = fixture()
    await expect(
      getServiceCommerceFulfillmentOrder(db, {
        ...context,
        actorUserId: "attendant-1",
      }),
    ).resolves.toMatchObject({
      fulfilmentType: "pickup",
      paid: true,
      source: context.source,
    })
    expect(calls).toEqual(["authorize", "order"])
    expect(predicates[0]).toMatchObject({
      capability: "ATTENDANT",
      membership: { tenantId: "tenant-1", userId: "attendant-1" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(predicates[1]).toEqual({
      id: "order-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("fails a mismatched source closed", async () => {
    const { db } = fixture({ sourceId: "request-other" })
    await expect(
      getServiceCommerceFulfillmentOrder(db, {
        ...context,
        actorUserId: "attendant-1",
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceFulfillmentError)
  })

  test("fails before Order lookup without an active Store attendant", async () => {
    const { calls, db } = fixture({ attendant: false })
    await expect(
      getServiceCommerceFulfillmentOrder(db, {
        ...context,
        actorUserId: "unassigned-user",
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_BLOCKED" })
    expect(calls).toEqual(["authorize"])
  })

  test("enforces payment and operational gates at the transaction boundary", async () => {
    const { transaction } = fixture({ paymentStatus: "PENDING" })
    await expect(
      assertServiceCommerceFulfillmentGatesInTransaction(transaction as never, {
        ...context,
        authorize: async () => {},
        eligible: true,
        operation: "prepare",
        packed: true,
        ready: true,
        verticalReleaseReady: true,
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_BLOCKED" })

    const paid = fixture().transaction
    await expect(
      assertServiceCommerceFulfillmentGatesInTransaction(paid as never, {
        ...context,
        authorize: async () => {},
        eligible: true,
        operation: "prepare",
        packed: false,
        ready: false,
        verticalReleaseReady: true,
      }),
    ).resolves.toMatchObject({ gates: { canPrepare: true } })
  })

  test("atomically revises the current payable Quote for fulfilment", async () => {
    const writes: Array<{ kind: string; value: unknown }> = []
    const tx = {
      commerceQuote: {
        updateMany: async (value: unknown) => {
          writes.push({ kind: "quote", value })
          return { count: 1 }
        },
      },
      commerceQuoteLine: {
        createMany: async (value: unknown) => {
          writes.push({ kind: "lines", value })
          return { count: 1 }
        },
      },
      commerceQuoteOption: {
        create: async (value: unknown) => {
          writes.push({ kind: "option", value })
          return { id: "option-2" }
        },
      },
      commerceQuoteVersion: {
        create: async (value: { data: Record<string, unknown> }) => {
          writes.push({ kind: "version", value })
          return { id: "version-2", ...value.data }
        },
        findFirst: async (value: unknown) => {
          writes.push({ kind: "read", value })
          return {
            availabilityOutcome: "FULL",
            currencyCode: "NGN",
            customerNote: null,
            discountMinor: 0,
            expiresAt: new Date("2030-01-01T00:00:00.000Z"),
            fulfilmentFeeMinor: 0,
            fulfilmentPromise: "Collect tomorrow",
            fulfilmentType: "PICKUP",
            id: "version-1",
            lines: [
              {
                availabilityAttestationId: null,
                balanceRevision: null,
                catalogItemName: "Bag",
                configurationVersionId: null,
                customerNote: null,
                offeringId: null,
                offeringName: "Red bag",
                optionSelections: {},
                outcome: "INCLUDED",
                quantity: null,
                sourceLineId: "line-1",
                totalMinor: 20_000_00,
                unitPriceMinor: 20_000_00,
                variantName: "Small",
              },
            ],
            optionSelection: null,
            options: [],
            payloadHash: "payload-1",
            quote: {
              currentVersionId: "version-1",
              id: "quote-1",
              sourceId: "request-1",
              sourceType: "SERVICE_REQUEST",
              storeId: "store-1",
              tenantId: "tenant-1",
            },
            quoteId: "quote-1",
            status: "ISSUED",
            subtotalMinor: 20_000_00,
            taxMinor: 0,
            totalMinor: 20_000_00,
            version: 1,
          }
        },
        updateMany: async (value: unknown) => {
          writes.push({ kind: "supersede", value })
          return { count: 1 }
        },
      },
    }
    await expect(
      reviseServiceCommerceQuoteForFulfillmentInTransaction(tx as never, {
        acceptanceTokenDigest: "digest-2",
        clientVersionId: "delivery-2",
        createdByUserId: "attendant-1",
        expectedVersionId: "version-1",
        fulfilmentFeeMinor: 2_500,
        fulfilmentPromise: "Delivered tomorrow",
        fulfilmentType: "delivery",
        label: "Delivery",
        payloadHash: "payload-2",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({
      version: { id: "version-2", totalMinor: 2_002_500 },
    })
    expect(writes.map((write) => write.kind)).toEqual([
      "read",
      "version",
      "option",
      "lines",
      "supersede",
      "quote",
    ])
    expect(writes[0]?.value).toMatchObject({
      where: {
        id: "version-1",
        quote: {
          is: {
            sourceId: "request-1",
            sourceType: "SERVICE_REQUEST",
            storeId: "store-1",
            tenantId: "tenant-1",
          },
        },
      },
    })

    await expect(
      reviseServiceCommerceQuoteForFulfillmentInTransaction(tx as never, {
        acceptanceTokenDigest: "digest-invalid",
        clientVersionId: "delivery-invalid",
        createdByUserId: "attendant-1",
        expectedVersionId: "version-1",
        fulfilmentFeeMinor: -1,
        fulfilmentPromise: "Delivered tomorrow",
        fulfilmentType: "delivery",
        label: "Delivery",
        payloadHash: "payload-invalid",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_BLOCKED" })
  })
})
