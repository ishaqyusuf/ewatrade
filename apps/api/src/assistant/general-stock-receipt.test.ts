import { expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
const receipt = {
  action: "stock_receive",
  balanceSourceId: "source",
  enteredInventoryUnitId: "unit",
  enteredQuantity: "2.5",
  reason: "Delivery received",
  source: "Delivery note QA",
}
test("stock rehearsal drafts exact receipt data and rejects injected authority", () => {
  const command = (payload: object) =>
    respondGeneralRehearsal([
      { role: "user", content: `receive stock ${JSON.stringify(payload)}` },
    ])
  expect(command(receipt)).toEqual({
    kind: "tool",
    toolName: "draftAction",
    input: receipt,
  })
  expect(command({ ...receipt, storeId: "foreign" }).kind).toBe("text")
  expect(command({ ...receipt, enteredQuantity: "0" }).kind).toBe("text")
})
test("stock receipts require explicit positive quantities and server-owned scope", () => {
  expect(generalActionSchema.safeParse(receipt).success).toBe(true)
  expect(
    generalActionSchema.safeParse({ ...receipt, unitCostMinor: 0 }).success,
  ).toBe(true)
  for (const changes of [
    { enteredQuantity: "0" },
    { enteredQuantity: "-2" },
    { enteredQuantity: "1.0000001" },
    { reason: "" },
    { source: "" },
    { unitCostMinor: -1 },
    { unitCostMinor: 1.5 },
    { effectiveAt: "yesterday" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { expectedBalanceRevision: 1 },
    { clientOperationId: "injected" },
    { direction: "decrease" },
  ])
    expect(
      generalActionSchema.safeParse({ ...receipt, ...changes }).success,
    ).toBe(false)
})

test("stock receipt metadata preserves canonical source/category bounds", () => {
  expect(
    generalActionSchema.safeParse({
      ...receipt,
      supplierName: "QA supplier",
      categories: [{ name: "Delivery" }],
    }).success,
  ).toBe(true)
  for (const change of [
    { source: "a".repeat(81) },
    { categories: [{ name: "\u0000" }] },
    { categories: [] },
    { categories: [{ name: "a".repeat(81) }] },
    { reason: "a".repeat(490), supplierName: "Long supplier" },
  ])
    expect(
      generalActionSchema.safeParse({ ...receipt, ...change }).success,
    ).toBe(false)
})
