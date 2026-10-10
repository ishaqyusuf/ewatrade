import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { getCommercialServiceLineReview } from "./commercial-service-line-review"

const input = {
  tenantId: "tenant", storeId: "store", orderLineId: "line",
  action: "fulfill" as const,
}
function fixture() {
  const line = {
    id: "line", kind: "SERVICE", quantity: "2.500000",
    snapshot: {
      offeringName: "Installation", serviceWorkPolicy: "CHARGE_ONLY",
      serviceAuthorizationPolicy: "AFTER_REQUIRED_PAYMENT",
    },
    serviceJobLines: [] as Array<{ id: string }>,
    serviceAuthorization: null as null | {
      tenantId: string; orderId: string; orderLineId: string;
      quantity: string; authorizedAt: Date;
    },
    serviceFulfillment: null,
    order: {
      id: "order", orderNumber: "ORD-1", status: "CONFIRMED",
      completedAt: null, currencyCode: "NGN", amountPaidMinor: 500,
      totalMinor: 1000, paymentStatus: "PARTIALLY_PAID", payments: [{ id: "payment" }],
      deliveryDueAt: null as Date | null,
      acceptedCommerceQuoteVersion: null as null | { quote: { sourceType: string } },
      prescriptionPickupFulfillment: null, prescriptionDeliveryAssignment: null,
    },
  }
  let missing = false
  const db = {
    commercialOrderLine: {
      findFirst: async (query: unknown) => {
        expect(query).toMatchObject({ where: {
          id: "line", order: { tenantId: "tenant", storeId: "store" },
        } })
        return missing ? null : line
      },
    },
  } as unknown as Prisma.TransactionClient
  return { line, db, hide: () => { missing = true } }
}

test("preview reports unpaid blocker, exact saved quantity and changes revision after settlement", async () => {
  const f = fixture()
  const unpaid = await getCommercialServiceLineReview(f.db, input)
  expect(unpaid.eligible).toBe(false)
  expect(unpaid.blocker?.code).toBe("SERVICE_WORK_NOT_AUTHORIZED")
  expect(unpaid.payment.balanceDueMinor).toBe(500)
  f.line.order.amountPaidMinor = 1000
  const paid = await getCommercialServiceLineReview(f.db, input)
  expect(paid.eligible).toBe(true)
  expect(paid.quantity).toBe("2.5")
  expect(paid.quantityScope).toBe("full_saved_line")
  expect(paid.effects).toMatchObject({ physicalStockChange: false, recordsServicePerformance: true })
  expect(paid.revision).not.toBe(unpaid.revision)
  expect((await getCommercialServiceLineReview(f.db, input)).revision).toBe(paid.revision)
})

test("manager release is separate from performance and must match scope and quantity", async () => {
  const f = fixture()
  f.line.snapshot.serviceAuthorizationPolicy = "MANUAL_RELEASE"
  const release = await getCommercialServiceLineReview(f.db, { ...input, action: "authorize" })
  expect(release.eligible).toBe(true)
  expect(release.effects.recordsServicePerformance).toBe(false)
  expect((await getCommercialServiceLineReview(f.db, input)).eligible).toBe(false)
  f.line.serviceAuthorization = {
    tenantId: "tenant", orderId: "order", orderLineId: "line",
    quantity: "2.5", authorizedAt: new Date("2026-01-01"),
  }
  expect((await getCommercialServiceLineReview(f.db, input)).eligible).toBe(true)
  f.line.serviceAuthorization.quantity = "1"
  expect((await getCommercialServiceLineReview(f.db, input)).eligible).toBe(false)
})

test("tracked jobs, prescriptions and future scheduled orders cannot be performed here", async () => {
  const f = fixture()
  f.line.snapshot.serviceAuthorizationPolicy = "ON_ORDER_CONFIRMATION"
  f.line.serviceJobLines = [{ id: "job-line" }]
  expect((await getCommercialServiceLineReview(f.db, input)).eligible).toBe(false)
  f.line.serviceJobLines = []
  f.line.order.acceptedCommerceQuoteVersion = { quote: { sourceType: "PRESCRIPTION_REQUEST" } }
  expect((await getCommercialServiceLineReview(f.db, input)).eligible).toBe(false)
  f.line.order.acceptedCommerceQuoteVersion = null
  f.line.order.deliveryDueAt = new Date("2999-01-01")
  expect((await getCommercialServiceLineReview(f.db, input)).eligible).toBe(false)
})

test("read is Store fenced and unavailable targets fail closed", async () => {
  const f = fixture()
  f.hide()
  await expect(getCommercialServiceLineReview(f.db, input)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
})

test("revision binds the action and ignores caller property order", async () => {
  const f = fixture()
  const original = await getCommercialServiceLineReview(f.db, input)
  const reordered = await getCommercialServiceLineReview(f.db, {
    action: "fulfill", orderLineId: "line", storeId: "store", tenantId: "tenant",
  })
  expect(reordered.revision).toBe(original.revision)
  expect((await getCommercialServiceLineReview(f.db, { ...input, action: "authorize" })).revision).not.toBe(original.revision)
})
