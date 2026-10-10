import { expect, test } from "bun:test"
import {
  stockAdjustmentAction,
  stockCorrectionAction,
} from "./stock-adjustment"
const adjustment = {
  action: "stock_adjust",
  balanceSourceId: "balance",
  enteredInventoryUnitId: "unit",
  enteredQuantity: "1.5",
  direction: "decrease",
  purpose: "waste",
  reason: "Broken stock",
  categories: [{ name: "Damage" }],
}
const correction = {
  action: "stock_correct",
  targetOperationId: "original",
  reason: "Correct observed quantity",
  corrections: [{ movementId: "movement", correctedEnteredQuantity: "2" }],
}
test("adjustments require explicit purpose, valid categories and no client authority", () => {
  expect(stockAdjustmentAction.safeParse(adjustment).success).toBe(true)
  for (const patch of [
    { direction: "increase" },
    { reason: "" },
    { categories: [] },
    { categories: [{ name: "\u0000" }] },
    { enteredQuantity: "0" },
    { tenantId: "other" },
    { expectedBalanceRevision: 2 },
    { unitCostMinor: 100 },
  ])
    expect(
      stockAdjustmentAction.safeParse({ ...adjustment, ...patch }).success,
    ).toBe(false)
})
test("corrections require original operation and unique exact movement replacements", () => {
  expect(stockCorrectionAction.safeParse(correction).success).toBe(true)
  for (const patch of [
    { targetOperationId: "" },
    { reason: "" },
    { corrections: [] },
    { corrections: [...correction.corrections, ...correction.corrections] },
    { storeId: "other" },
    {
      corrections: [{ movementId: "movement", correctedEnteredQuantity: "-1" }],
    },
    {
      corrections: [
        { ...correction.corrections[0], expectedBalanceRevision: 2 },
      ],
    },
  ])
    expect(
      stockCorrectionAction.safeParse({ ...correction, ...patch }).success,
    ).toBe(false)
})

test("rehearsal drafts both strict actions without accepting client authority", async () => {
  const { respondGeneralRehearsal } = await import("./rehearsal")
  for (const [verb, payload] of [
    ["adjust", adjustment],
    ["correct", correction],
  ] as const) {
    expect(
      respondGeneralRehearsal([
        { role: "user", content: `${verb} stock ${JSON.stringify(payload)}` },
      ]),
    ).toMatchObject({ kind: "tool", toolName: "draftAction", input: payload })
    expect(
      respondGeneralRehearsal([
        {
          role: "user",
          content: `${verb} stock ${JSON.stringify({ ...payload, tenantId: "foreign" })}`,
        },
      ]).kind,
    ).toBe("text")
  }
})

test("rehearsal reads current-Store history and exact original operation", async () => {
  const { respondGeneralRehearsal } = await import("./rehearsal")
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "read stock operations" },
    ]),
  ).toEqual({ kind: "tool", toolName: "readStockOperations", input: {} })
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "read stock operation original" },
    ]),
  ).toEqual({
    kind: "tool",
    toolName: "readStockOperation",
    input: { operationId: "original" },
  })
})
