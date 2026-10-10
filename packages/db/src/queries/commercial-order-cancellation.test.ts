import { expect, test } from "bun:test"
import { orderAmendmentFixture as fixture } from "./commercial-order-amendment-test-fixture"
import {
  cancelCommercialOrderInTransaction as cancel,
  previewCommercialOrderCancellation as preview,
} from "./commercial-order-cancellation"
const scope = { tenantId: "tenant", storeId: "store", orderId: "order" }

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
