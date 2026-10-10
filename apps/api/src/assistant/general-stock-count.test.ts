import { expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
const action = {
  action: "stock_count_create",
  reason: "Physical count",
  lines: [
    {
      balanceSourceId: "source",
      entries: [{ enteredInventoryUnitId: "unit", enteredQuantity: "0" }],
    },
  ],
}
test("count observations permit zero and reject authority or invalid quantities", () => {
  expect(generalActionSchema.safeParse(action).success).toBe(true)
  for (const input of [
    { ...action, storeId: "foreign" },
    { ...action, lines: [] },
    { ...action, lines: [...action.lines, ...action.lines] },
    ...["-1", "1.1234567", "Infinity"].map((enteredQuantity) => ({
      ...action,
      lines: [
        {
          balanceSourceId: "source",
          entries: [{ enteredInventoryUnitId: "unit", enteredQuantity }],
        },
      ],
    })),
    { ...action, lines: [{ ...action.lines[0], expectedRevision: 1 }] },
  ])
    expect(generalActionSchema.safeParse(input).success).toBe(false)
})
test("finalizing a saved count requires a separate strict action", () => {
  const finalize = {
    action: "stock_count_finalize",
    stockCountId: "count",
    reason: "Reviewed",
  }
  expect(generalActionSchema.safeParse(finalize).success).toBe(true)
  expect(
    generalActionSchema.safeParse({ ...finalize, reason: "" }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...finalize, lines: action.lines }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...action, finalize: true }).success,
  ).toBe(false)
})

test("rehearsal keeps observation creation, read and finalization separate", () => {
  const run = (content: string) =>
    respondGeneralRehearsal([{ role: "user", content }])
  expect(run(`create count ${JSON.stringify(action)}`)).toMatchObject({
    kind: "tool",
    toolName: "draftAction",
    input: { action: "stock_count_create" },
  })
  expect(run("read count saved-count")).toMatchObject({
    toolName: "readStockCount",
    input: { stockCountId: "saved-count" },
  })
  expect(run("finalize count saved-count because Reviewed")).toMatchObject({
    toolName: "draftAction",
    input: { action: "stock_count_finalize", stockCountId: "saved-count" },
  })
})
