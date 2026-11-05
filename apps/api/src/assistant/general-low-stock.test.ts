import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { inventoryLowStockPageSchema } from "../schemas/inventory"
import {
  staffProcedureAction,
  staffProcedureStoreInput,
} from "../utils/staff-procedure-policy"
import {
  generalLowStockAnswers,
  generalRunningLowAnswers,
} from "./general-low-stock-answers"

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
  expect(answers[0]?.value).toBe("0 items at 2 or less")
  expect(answers[1]?.value).toBe("Unavailable")
  for (const answer of answers)
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})

test("without a threshold, readLowStock reads saved levels; a given threshold is still validated", () => {
  const input = inventoryLowStockPageSchema
    .omit({ storeId: true })
    .partial({ threshold: true })
  expect(input.safeParse({}).success).toBe(true)
  expect(input.safeParse({ threshold: "-1" }).success).toBe(false)
  expect(input.safeParse({ storeId: "other" }).success).toBe(false)
  expect(staffProcedureAction("inventory.runningLow", "query")).toBe("stock")
  expect(staffProcedureStoreInput.has("inventory.runningLow")).toBe(true)
})

const stockRow = (
  productName: string,
  availableQuantity: string,
  unitName: string,
  lowStockLevel: string | null,
) => ({
  catalogItemId: productName,
  productName,
  variantName: productName,
  unitName,
  availableQuantity,
  lowStockLevel,
  out: availableQuantity === "0",
})

test("running-low answers list items at their saved level with owner-facing summaries", () => {
  const answers = generalRunningLowAnswers(
    {
      items: [stockRow("Layer feed", "9", "Bag", "10")],
      withoutLevel: {
        out: [stockRow("Grower feed", "0", "Bag", null)],
        fewestLeft: [stockRow("Notebook", "8", "Piece", null)],
      },
      levelsSet: 1,
      levelsMissing: 2,
      partial: false,
    },
    "Main",
  )
  expect(answers.map((answer) => [answer.title, answer.value])).toEqual([
    ["Running low", "1 item"],
    ["Layer feed", "9 bags"],
    ["Grower feed", "Out of stock"],
  ])
  expect(answers[1]?.summary).toBe("Low-stock level 10 bags")
  expect(answers[2]?.summary).toBe("No low-stock level set")
  for (const answer of answers) {
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
    expect(answer.summary).toBeDefined()
  }
})

test("with no saved level anywhere, running low says so and names the least left", () => {
  const answers = generalRunningLowAnswers(
    {
      items: [],
      withoutLevel: {
        out: [stockRow("Grower feed", "0", "Bag", null)],
        fewestLeft: [stockRow("Notebook", "8", "Piece", null)],
      },
      levelsSet: 0,
      levelsMissing: 18,
      partial: false,
    },
    "Main",
  )
  expect(answers[0]).toMatchObject({
    value: "No low-stock levels set",
    summary: "Set a level on each product in Inventory",
  })
  expect(answers.map((answer) => answer.title)).toEqual([
    "Running low",
    "Grower feed",
    "Notebook",
  ])
  expect(answers[2]).toMatchObject({
    value: "8 pieces",
    summary: "Least left · no level set",
  })
  expect(answers[0]?.detail).toContain("Do not ask for a threshold")
})
