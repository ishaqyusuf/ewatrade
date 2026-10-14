import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { stockPackageTransformAction } from "./stock-transform"

const draft = {
  action: "stock_package_transform" as const,
  sourceBalanceSourceId: "crate-balance",
  targetBalanceSourceId: "piece-balance",
  sourceQuantity: "2",
  reason: "Open two crates for single sales",
}

test("a repack names both exact balances and only the source quantity", () => {
  expect(stockPackageTransformAction.parse(draft)).toEqual(draft)
  expect(generalActionSchema.parse(draft)).toEqual(draft)
  for (const invalid of [
    { ...draft, sourceQuantity: "0" },
    { ...draft, sourceQuantity: "-1" },
    { ...draft, targetQuantity: "60" },
    { ...draft, storeId: "other-store" },
    { ...draft, reason: " " },
    { ...draft, targetBalanceSourceId: "" },
  ])
    expect(stockPackageTransformAction.safeParse(invalid).success).toBe(false)
})
