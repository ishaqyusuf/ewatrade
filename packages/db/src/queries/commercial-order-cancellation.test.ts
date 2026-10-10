import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  cancelCommercialOrderInTransaction as cancel,
  previewCommercialOrderCancellation as preview,
} from "./commercial-order-cancellation"
const scope = { tenantId: "tenant", storeId: "store", orderId: "order" }
function fixture() {
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    reservedQuantity: "3",
    onHandQuantity: "8",
    revision: 1,
  }
  const reservation = {
    id: "reservation",
    tenantId: "tenant",
    storeId: "store",
    commercialOrderLineId: "line",
    balanceSourceId: "balance",
    balanceSource: balance,
    status: "ACTIVE",
    committedAt: null,
    committedOperationId: null,
    enteredQuantity: "2",
    canonicalQuantity: "2",
    unitFactorSnapshot: "1",
    enteredInventoryUnit: { stockBehavior: "ALTERNATE_TRANSACTION" },
  }
  const row = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    currencyCode: "NGN",
    customerId: null,
    orderNumber: "ORD-1",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    amountPaidMinor: 0,
    totalMinor: 100,
    updatedAt: new Date("2026-10-10T00:00:00Z"),
    store: { status: "ACTIVE" },
    acceptedQuoteVersion: null,
    acceptedCommerceQuoteVersion: null,
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
    lines: [
      {
        id: "line",
        orderId: "order",
        offeringId: "offering",
        kind: "PRODUCT_UNIT",
        quantity: "2",
        snapshot: {
          orderLineId: "line",
          offeringId: "offering",
          offeringKind: "PRODUCT_UNIT",
          quantity: "2",
        },
        stockReservation: reservation,
        _count: { productFulfillments: 0, serviceJobLines: 0 },
      },
    ],
  }
  const events: string[] = []
  let saved: Record<string, unknown> | null = null
  const tx = {
    commercialOrder: {
      findFirst: async () => row,
      update: async ({ data }: { data: { status: string } }) => {
        events.push("cancel")
        Object.assign(row, data)
        return row
      },
    },
    commercialOrderAmendment: {
      findUnique: async () => saved,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("receipt")
        saved = { id: "amendment", ...data }
        return saved
      },
    },
    stockReservation: {
      findFirst: async () => reservation,
      update: async ({ data }: { data: { status: string } }) => {
        events.push("release")
        Object.assign(reservation, data)
        return reservation
      },
    },
    stockBalanceSource: {
      updateMany: async ({ data }: { data: { reservedQuantity: string } }) => {
        events.push("balance")
        balance.reservedQuantity = data.reservedQuantity
        balance.revision++
        return { count: 1 }
      },
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?")
      if (sql.includes('FROM "FinanceBook"')) {
        events.push("lock:book")
        return []
      }
      if (sql.includes('FROM "CommercialOrder"')) {
        events.push("lock:order")
        return [{ id: "order" }]
      }
      if (sql.includes('FROM "StockReservation"')) {
        events.push("lock:reservation")
        return [
          { id: "reservation", storeId: "store", balanceSourceId: "balance" },
        ]
      }
      if (sql.includes('FROM "StockBalanceSource"')) {
        events.push("lock:balance")
        return [{ id: "balance" }]
      }
      throw Error("Unexpected query")
    },
  } as unknown as Prisma.TransactionClient
  return { tx, row, reservation, balance, events, readReceipt: () => saved }
}
async function command(f: ReturnType<typeof fixture>) {
  return {
    ...scope,
    actorUserId: "actor",
    clientOperationId: "command",
    reason: "Customer cancelled before work",
    expectedReviewDigest: (await preview(f.tx, scope)).reviewDigest,
  }
}
test("preview shows exact reservation release, no on-hand movement and no refund", async () => {
  const f = fixture()
  const result = await preview(f.tx, scope)
  expect(result.eligible).toBe(true)
  expect(result.releases).toEqual([
    {
      reservationId: "reservation",
      orderLineId: "line",
      balanceSourceId: "balance",
      quantity: "2",
    },
  ])
  expect(result.stockOnHandChange).toBe("0")
  expect(result.moneyRefundMinor).toBe(0)
  expect(f.events).toEqual([])
})
test("cancellation retains immutable snapshots, releases once and saves an atomic-command receipt", async () => {
  const f = fixture()
  const input = await command(f)
  const original = JSON.stringify(f.row.lines[0]?.snapshot)
  const receipt = await cancel(f.tx, input)
  expect(receipt.kind).toBe("CANCEL")
  expect(f.row.status).toBe("CANCELLED")
  expect(f.balance.onHandQuantity).toBe("8")
  expect(f.balance.reservedQuantity).toBe("1")
  expect(JSON.stringify(f.row.lines[0]?.snapshot)).toBe(original)
  expect(f.events.slice(0, 4)).toEqual([
    "lock:book",
    "lock:order",
    "lock:reservation",
    "lock:balance",
  ])
  expect(f.events.slice(-4)).toEqual([
    "balance",
    "release",
    "cancel",
    "receipt",
  ])
  const writes = f.events.length
  expect((await cancel(f.tx, input)).id).toBe(receipt.id)
  expect(f.events).toHaveLength(writes)
  // Property ordering must not change command identity.
  const { reason, ...rest } = input
  expect((await cancel(f.tx, { ...rest, reason })).id).toBe(receipt.id)
  await expect(
    cancel(f.tx, { ...input, reason: "Different request" }),
  ).rejects.toThrow("different input")
})
test("new reservations or changed stock invalidate the reviewed digest before writes", async () => {
  const f = fixture()
  const input = await command(f)
  f.balance.reservedQuantity = "4"
  f.balance.revision++
  await expect(cancel(f.tx, input)).rejects.toThrow("Review cancellation again")
  expect(f.row.status).toBe("CONFIRMED")
  expect(f.readReceipt()).toBeNull()
  expect(f.reservation.status).toBe("ACTIVE")
})
test("payment and fulfillment facts introduced after preview cannot be bypassed", async () => {
  for (const key of ["payments", "returns", "serviceFulfillments"] as const) {
    const f = fixture()
    const input = await command(f)
    f.row._count[key] = 1
    await expect(cancel(f.tx, input)).rejects.toThrow()
    expect(f.readReceipt()).toBeNull()
    expect(f.reservation.status).toBe("ACTIVE")
  }
})
test("foreign reservation ownership refuses even read-only preview", async () => {
  const f = fixture()
  f.reservation.storeId = "foreign"
  await expect(preview(f.tx, scope)).rejects.toThrow("ownership")
})
test("reservation reconciliation conflict refuses preview before any writes", async () => {
  const f = fixture()
  f.balance.reservedQuantity = "1"
  await expect(preview(f.tx, scope)).rejects.toThrow("reconciliation")
  expect(f.events).toEqual([])
})

test("combined releases cannot exceed one balance's reserved stock", async () => {
  const f = fixture()
  const first = f.row.lines[0]
  if (!first) throw Error("Fixture line missing")
  f.row.lines.push({
    ...first,
    id: "line-2",
    snapshot: { ...first.snapshot, orderLineId: "line-2" },
    stockReservation: {
      ...f.reservation,
      id: "reservation-2",
      commercialOrderLineId: "line-2",
    },
  })
  f.row._count.lines = 2
  await expect(preview(f.tx, scope)).rejects.toThrow(
    "Combined order reservations",
  )
  expect(f.events).toEqual([])
})
