import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { getCommercialOrderAmendmentEligibility } from "./commercial-order-amendment-review"
const scope = { tenantId: "tenant", storeId: "store", orderId: "order" }
function fixture() {
  const line = {
    id: "line",
    orderId: "order",
    offeringId: "offering",
    kind: "PRODUCT_UNIT",
    quantity: "1",
    snapshot: {
      orderLineId: "line",
      offeringId: "offering",
      offeringKind: "PRODUCT_UNIT",
      quantity: "1",
    },
    stockReservation: {
      status: "ACTIVE",
      committedAt: null as Date | null,
      committedOperationId: null as string | null,
    },
    _count: { productFulfillments: 0, serviceJobLines: 0 },
  }
  const row = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    orderNumber: "ORD-1",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    amountPaidMinor: 0,
    updatedAt: new Date("2026-10-10T00:00:00Z"),
    store: { status: "ACTIVE" },
    acceptedQuoteVersion: null as { id: string } | null,
    acceptedCommerceQuoteVersion: null as { id: string } | null,
    serviceIntake: null,
    prescriptionPickupFulfillment: null,
    prescriptionDeliveryAddress: null,
    prescriptionDeliveryAssignment: null,
    _count: {
      lines: 1,
      payments: 0,
      ledgerEntries: 0,
      returns: 0,
      serviceAuthorizations: 0,
      serviceFulfillments: 0,
      serviceJobs: 0,
      prescriptionPaymentIntents: 0,
      serviceBookings: 0,
    },
    lines: [line],
  }
  const db = {
    commercialOrder: {
      findFirst: async (query: unknown) => {
        expect(query).toMatchObject({
          where: { id: "order", tenantId: "tenant", storeId: "store" },
          select: { lines: { take: 501 } },
        })
        return row
      },
    },
  } as unknown as Prisma.TransactionClient
  return { row, line, db }
}
test("eligibility reads the exact Store order and leaves ordinary active reservations intact", async () => {
  const f = fixture()
  const result = await getCommercialOrderAmendmentEligibility(f.db, scope)
  expect(result.eligibility.eligibleForOrdinaryAmendment).toBe(true)
  expect(result.orderId).toBe("order")
  expect(f.line.stockReservation.status).toBe("ACTIVE")
})
test("counts expose source history even when net paid and status appear unchanged", async () => {
  const f = fixture()
  f.row._count.payments = 2
  f.row._count.returns = 1
  f.row._count.serviceJobs = 1
  const result = await getCommercialOrderAmendmentEligibility(f.db, scope)
  expect(result.eligibility.blockers.map((x) => x.code)).toEqual([
    "PAYMENT_HISTORY",
    "FULFILLMENT_HISTORY",
    "SERVICE_SOURCE",
  ])
})
test("a restored reservation status cannot hide its committed operation", async () => {
  const f = fixture()
  f.line.stockReservation.committedOperationId = "stock-operation"
  expect(
    (
      await getCommercialOrderAmendmentEligibility(f.db, scope)
    ).eligibility.blockers.map((x) => x.code),
  ).toContain("FULFILLMENT_HISTORY")
})
test("incomplete lines and inconsistent snapshots cannot produce eligibility", async () => {
  const f = fixture()
  f.row._count.lines = 2
  expect(
    (await getCommercialOrderAmendmentEligibility(f.db, scope)).eligibility
      .eligibleForOrdinaryAmendment,
  ).toBe(false)
  f.row._count.lines = 1
  f.line.snapshot.quantity = "2"
  expect(
    (
      await getCommercialOrderAmendmentEligibility(f.db, scope)
    ).eligibility.blockers.map((x) => x.code),
  ).toContain("INCOMPLETE_EVIDENCE")
})
test("Store and tenant mismatch fail closed even if a repository returns a row", async () => {
  const f = fixture()
  f.row.storeId = "foreign"
  await expect(
    getCommercialOrderAmendmentEligibility(f.db, scope),
  ).rejects.toThrow("not found")
  f.row.storeId = "store"
  f.row.tenantId = "foreign"
  await expect(
    getCommercialOrderAmendmentEligibility(f.db, scope),
  ).rejects.toThrow("not found")
})
test("accepted commerce quotes and prescription intents retain source ownership", async () => {
  const f = fixture()
  f.row.acceptedCommerceQuoteVersion = { id: "quote" }
  f.row._count.prescriptionPaymentIntents = 1
  expect(
    (
      await getCommercialOrderAmendmentEligibility(f.db, scope)
    ).eligibility.blockers.map((x) => x.code),
  ).toEqual(["QUOTE_SOURCE", "PRESCRIPTION_SOURCE"])
})
