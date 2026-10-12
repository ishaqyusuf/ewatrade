import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const line = {
  balanceSourceId: "balance",
  enteredInventoryUnitId: "unit",
  expectedConfigurationVersionId: "config",
  expectedBalanceRevision: 3,
  enteredQuantity: "2.125",
  amountMinor: "100",
  description: "Received flour",
  categories: [{ name: "Supplier receipt" }],
}
const payload = {
  action: "purchase_record",
  bookId: "book",
  supplierId: "supplier",
  description: "Received goods",
  incurredAt: "2026-10-01T12:00:00.123Z",
  dueAt: "2026-10-08T12:00:00.123Z",
  invoiceOwnershipReceiptConfirmed: true,
  lines: [line],
}
test("direct purchase is strict and confirms invoice, ownership and physical receipt together", () => {
  expect(generalActionSchema.safeParse(payload).success).toBe(true)
  for (const change of [
    { invoiceOwnershipReceiptConfirmed: false },
    { storeId: "other" },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "key" },
    { sourceProof: {} },
    { incurredAt: "yesterday" },
    { dueAt: "2026-01-01T00:00:00Z" },
    { lines: [] },
    { lines: [line, line] },
    { lines: [{ ...line, expectedBalanceRevision: undefined }] },
    { lines: [{ ...line, expectedBalanceRevision: 2147483647 }] },
    { lines: [{ ...line, enteredQuantity: "1e2" }] },
    { lines: [{ ...line, amountMinor: "0" }] },
    { lines: [{ ...line, categories: [] }] },
    { lines: [{ ...line, categories: [{ categoryNameId: 0 }] }] },
    {
      lines: [
        { ...line, amountMinor: "100000000000000" },
        { ...line, balanceSourceId: "b2", amountMinor: "1" },
      ],
    },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(capabilityForAction("purchase_record")).toMatchObject({
    rollout: "planned",
    clients: ["dashboard"],
    scope: "store",
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.recordPurchase"],
    receipt: "finance_purchase_bill",
  })
  expect(
    generalReceiptSchema.safeParse({
      kind: "finance_purchase_bill",
      recordId: "bill",
      title: "Purchase",
      detail: "Received",
    }).success,
  ).toBe(false)
})
test("direct purchase preserves maximum ten distinct goods and one hundred named or existing categories", () => {
  const maximum = {
    ...payload,
    lines: Array.from({ length: 10 }, (_, i) => ({
      ...line,
      balanceSourceId: `b${i}`,
      categories: Array.from({ length: 10 }, (_, c) =>
        i % 2 ? { categoryNameId: c + 1 } : { name: `Category ${i}-${c}` },
      ),
    })),
  }
  expect(generalActionSchema.safeParse(maximum).success).toBe(true)
  expect(
    generalActionSchema.safeParse({
      ...maximum,
      lines: [...maximum.lines, { ...line, balanceSourceId: "b11" }],
    }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({
      ...payload,
      lines: [
        {
          ...line,
          categories: Array.from({ length: 11 }, (_, i) => ({
            name: `Category ${i}`,
          })),
        },
      ],
    }).success,
  ).toBe(false)
})
