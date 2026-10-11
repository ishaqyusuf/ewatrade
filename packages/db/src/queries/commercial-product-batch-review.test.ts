import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { assertCommercialProductBatchReview, getCommercialProductBatchReview } from "./commercial-product-batch-review"

const input = { tenantId: "tenant", storeId: "store", orderId: "order", expectedReviewRevision: "old" }

test("review guard locks unique balances in order before reading changed scope", async () => {
  const events: string[] = []
  const db = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      if (parts.join("").includes("StockReservation")) {
        events.push("reservations")
        expect(values).toEqual(["order", "tenant", "store"])
        return [{ id: "1", balanceSourceId: "b" }, { id: "2", balanceSourceId: "a" }, { id: "3", balanceSourceId: "b" }]
      }
      events.push(`balance:${values[0]}`)
      return [{ id: values[0] }]
    },
    commercialOrder: { findFirst: async () => { events.push("review"); return { id: "order" } } },
    commercialOrderLine: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient
  await expect(assertCommercialProductBatchReview(db, input)).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(events).toEqual(["reservations", "balance:a", "balance:b", "review"])
})

test("missing locked balance refuses before review and Store is mandatory", async () => {
  let calls = 0
  const db = { $queryRaw: async () => ++calls === 1 ? [{ id: "r", balanceSourceId: "missing" }] : [] } as unknown as Prisma.TransactionClient
  await expect(assertCommercialProductBatchReview(db, input)).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(calls).toBe(2)
  await expect(assertCommercialProductBatchReview(db, { ...input, storeId: undefined })).rejects.toMatchObject({ code: "INVALID_ORDER" })
  await assertCommercialProductBatchReview(db, { ...input, expectedReviewRevision: undefined })
  expect(calls).toBe(2)
})


test("catalog-free review survives actor context and rejects later service evidence changes", async () => {
  const order = { id: "order", orderNumber: "ORD-1", status: "CONFIRMED", deliveryDueAt: null }
  const line = { id: "service", kind: "SERVICE", quantity: "1",
    snapshot: { offeringName: "Quick sale", serviceWorkPolicy: "CHARGE_ONLY", serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION" },
    serviceJobLines: [], serviceAuthorization: null, serviceFulfillment: null,
    order: { ...order, completedAt: null, currencyCode: "NGN", amountPaidMinor: 0,
      totalMinor: 100, paymentStatus: "UNPAID", payments: [], acceptedCommerceQuoteVersion: null,
      prescriptionPickupFulfillment: null, prescriptionDeliveryAssignment: null },
  }
  const db = {
    $queryRaw: async () => [],
    commercialOrder: { findFirst: async () => order },
    commercialOrderLine: { findMany: async () => [{ id: line.id, kind: line.kind }], findFirst: async () => line },
  } as unknown as Prisma.TransactionClient
  const scope = { tenantId: "tenant", storeId: "store", orderId: "order", userId: "actor" }
  const review = await getCommercialProductBatchReview(db, scope)
  expect(review.products).toEqual([])
  expect(review.services[0]?.effects.recordsServicePerformance).toBe(true)
  expect(review.executionOrder).toEqual(["service"])
  await assertCommercialProductBatchReview(db, { ...input, expectedReviewRevision: review.revision })
  line.quantity = "2"
  await expect(assertCommercialProductBatchReview(db, { ...input, expectedReviewRevision: review.revision }))
    .rejects.toMatchObject({ code: "REVISION_CONFLICT" })
})
