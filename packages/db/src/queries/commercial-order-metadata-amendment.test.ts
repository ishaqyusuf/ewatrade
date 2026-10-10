import { expect, test } from "bun:test"
import { orderAmendmentFixture as fixture } from "./commercial-order-amendment-test-fixture"
import {
  type OrderMetadataPatch,
  amendCommercialOrderMetadataInTransaction as amend,
  orderMetadataPatchSchema,
  previewCommercialOrderMetadataAmendment as preview,
} from "./commercial-order-metadata-amendment"
const scope = { tenantId: "tenant", storeId: "store", orderId: "order" }
async function command(
  f: ReturnType<typeof fixture>,
  patch: OrderMetadataPatch = { notes: "Updated instructions" },
) {
  return {
    ...scope,
    actorUserId: "actor",
    clientOperationId: "command",
    reason: "Customer requested change",
    patch,
    expectedReviewDigest: (await preview(f.tx, { ...scope, patch }))
      .reviewDigest,
  }
}
test("metadata schema rejects status, currency, totals, lines and empty changes", () => {
  for (const patch of [
    {},
    { notes: "x", status: "CANCELLED" },
    { currencyCode: "USD" },
    { totalMinor: 0 },
    { lines: [] },
    { tenantId: "foreign" },
    { customerId: "" },
    { deliveryDueAt: "tomorrow" },
  ])
    expect(orderMetadataPatchSchema.safeParse(patch).success).toBe(false)
})
test("omitted customer stays unchanged while explicit null clears all contact snapshots", async () => {
  const f = fixture()
  f.row.customerId = "old"
  f.row.customerName = "Old customer"
  f.row.customerPhone = "123"
  const keep = await preview(f.tx, { ...scope, patch: { notes: "New note" } })
  expect(keep.after.customerId).toBe("old")
  expect(keep.after.customerPhone).toBe("123")
  const clear = await preview(f.tx, { ...scope, patch: { customerId: null } })
  expect(clear.after).toMatchObject({
    customerId: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    notes: "Original instructions",
  })
  expect(f.row.customerId).toBe("old")
})
test("selected customer fields come from the tenant directory and stale changes refuse", async () => {
  const f = fixture()
  const input = await command(f, { customerId: "customer" })
  f.customer.name = "Changed customer"
  await expect(amend(f.tx, input)).rejects.toThrow("Review the amendment again")
  expect(f.row.customerId).toBeNull()
  expect(f.readReceipt()).toBeNull()
  await expect(
    preview(f.tx, { ...scope, patch: { customerId: "foreign" } }),
  ).rejects.toThrow("not found")
})
test("notes clearing and offset dates have explicit normalized preview semantics", async () => {
  const f = fixture()
  const result = await preview(f.tx, {
    ...scope,
    patch: { notes: " ", deliveryDueAt: "2026-10-12T11:00:00+01:00" },
  })
  expect(result.after.notes).toBeNull()
  expect(result.after.deliveryDueAt).toBe("2026-10-12T10:00:00.000Z")
  expect(result.totalChangeMinor).toBe(0)
  expect(result.moneyMovementMinor).toBe(0)
})
test("confirmation retains before/after evidence and replays without touching stock or lines", async () => {
  const f = fixture()
  const input = await command(f, {
    customerId: "customer",
    notes: "Changed note",
  })
  const original = JSON.stringify(f.row.lines)
  const receipt = await amend(f.tx, input)
  expect(receipt.kind).toBe("METADATA")
  expect(receipt.beforeSnapshot).toMatchObject({
    customerId: null,
    notes: "Original instructions",
  })
  expect(receipt.afterSnapshot).toMatchObject({
    metadata: {
      customerId: "customer",
      customerName: "QA customer",
      notes: "Changed note",
    },
    totalChangeMinor: 0,
  })
  expect(f.row.status).toBe("CONFIRMED")
  expect(JSON.stringify(f.row.lines)).toBe(original)
  expect(f.balance.reservedQuantity).toBe("3")
  expect(f.events).not.toContain("release")
  expect(f.events).not.toContain("balance")
  const count = f.events.length
  expect((await amend(f.tx, input)).id).toBe(receipt.id)
  expect(f.events).toHaveLength(count)
  await expect(
    amend(f.tx, { ...input, patch: { notes: "Another change" } }),
  ).rejects.toThrow("different input")
})
test("paid history and changed order fields invalidate a reviewed amendment", async () => {
  const f = fixture()
  const input = await command(f)
  f.row._count.payments = 1
  await expect(amend(f.tx, input)).rejects.toThrow("Payment")
  expect(f.row.notes).toBe("Original instructions")
  const g = fixture()
  const stale = await command(g)
  g.row.notes = "Intervening change"
  await expect(amend(g.tx, stale)).rejects.toThrow("Review the amendment again")
  expect(g.readReceipt()).toBeNull()
})
test("no-op amendments are refused instead of creating empty history", async () => {
  const f = fixture()
  await expect(
    preview(f.tx, { ...scope, patch: { notes: "Original instructions" } }),
  ).rejects.toThrow("unchanged")
})
