import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { stockCustodyMoveAction } from "./stock-custody"

const assign = {
  action: "stock_custody_move" as const,
  sourceBalanceSourceId: "balance-store",
  target: { type: "staff" as const, userId: "amina-u" },
  quantity: "2.5",
  reason: "Delivery round",
}

test("custody moves take an exact staff identity or the Store", () => {
  expect(stockCustodyMoveAction.parse(assign)).toEqual(assign)
  expect(generalActionSchema.parse(assign)).toEqual(assign)
  const back = { ...assign, target: { type: "store" as const } }
  expect(stockCustodyMoveAction.parse(back)).toEqual(back)
  for (const invalid of [
    { ...assign, quantity: "0" },
    { ...assign, quantity: "-1" },
    { ...assign, target: { type: "staff", name: "Amina" } },
    { ...assign, target: { type: "session", userId: "s-1" } },
    { ...assign, target: { type: "store", storeId: "other-store" } },
    { ...assign, tenantId: "foreign" },
    { ...assign, reason: " " },
  ])
    expect(stockCustodyMoveAction.safeParse(invalid).success).toBe(false)
})
