import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { inventoryLowStockPageSchema } from "../schemas/inventory"
import {
  staffProcedureAction,
  staffProcedureStoreInput,
} from "../utils/staff-procedure-policy"
import { generalLowStockAnswers } from "./general-low-stock-answers"

test("low-stock input requires an explicit threshold/Store and rejects scope injection", () => {
  expect(
    inventoryLowStockPageSchema.safeParse({ storeId: "s", threshold: "0" })
      .success,
  ).toBe(true)
  for (const input of [
    { storeId: "s" },
    { threshold: "1" },
    { storeId: "s", threshold: "-1" },
    { storeId: "s", threshold: "1e3" },
    { storeId: "s", threshold: "1", tenantId: "other" },
    { storeId: "s", threshold: "1", limit: 21 },
  ])
    expect(inventoryLowStockPageSchema.safeParse(input).success).toBe(false)
  expect(staffProcedureAction("inventory.lowStockPage", "query")).toBe("stock")
  expect(staffProcedureStoreInput.has("inventory.lowStockPage")).toBe(true)
})
test("low-stock answers identify incomplete pages and never turn unavailable into zero", () => {
  const answers = generalLowStockAnswers(
    {
      threshold: parseExactDecimal("2"),
      thresholdBasis: "each_offering_unit",
      scannedCount: 1,
      lowStock: [],
      unavailable: [
        {
          offeringId: "offer",
          offeringName: "Crate",
          catalogItemId: "p",
          productName: "Eggs",
          variantName: "Large",
          unitName: "Crate",
          status: "unavailable",
          reason: "Stock is not configured.",
        },
      ],
      hasMore: true,
      nextCursor: "offer",
    },
    "Store",
  )
  expect(answers[0]?.detail).toContain("More offerings remain")
  expect(answers[0]?.value).toBe("0 matches on this page")
  expect(answers[1]?.value).toBe("Unavailable")
  for (const answer of answers)
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})
