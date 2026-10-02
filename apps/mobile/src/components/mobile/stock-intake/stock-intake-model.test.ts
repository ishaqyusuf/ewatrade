import { expect, test } from "bun:test"
import {
  INITIAL_STOCK_DRAFT,
  type StockBalance,
  type StockReview,
  stockCommand,
  stockDraftReadiness,
} from "./stock-intake-model"

const balance: StockBalance = {
  availableQuantity: "500",
  balanceSourceId: "balance",
  configurationVersionId: "version",
  custodyReferenceId: null,
  custodyType: "STORE",
  inventoryUnitFactor: "1",
  inventoryUnitId: "unit",
  inventoryUnitName: "birds",
  inventoryUnitTransactionScale: 0,
  kind: "SHARED_POOL",
  onHandQuantity: "500",
  productId: "layers",
  productName: "Layers",
  reservedQuantity: "0",
  revision: 0,
  storeId: "store",
  storeName: "Farm",
  variantId: "variant",
  variantName: "Layers",
}
const review: StockReview = {
  balance,
  draft: {
    ...INITIAL_STOCK_DRAFT,
    quantity: "2",
    mode: "adjustment",
    direction: "decrease",
    categories: [{ categoryNameId: 7, name: "Mortality" }],
    categoryInput: "Row 1",
  },
  quantity: "2",
  recipientName: "",
  businessId: "business",
  userId: "user",
  storeId: "store",
}

test("native bird-loss review sends numeric selectors and captures uncommitted category text", () => {
  expect(stockDraftReadiness(review.draft, balance, []).error).toBeNull()
  const command = stockCommand(review, "retained-request")
  expect(command.kind).toBe("balance")
  if (command.kind !== "balance") throw new Error("Expected stock operation")
  expect(command.input.categories).toEqual([
    { categoryNameId: 7 },
    { name: "Row 1" },
  ])
  expect(command.input.reason).toBeUndefined()
  expect(command.input.direction).toBe("decrease")
  expect(command.input.enteredQuantity).toBe("2")
  expect(stockCommand(review, "retained-request")).toEqual(command)
})
test("native Receive requires a category and Count still requires its reason", () => {
  expect(
    stockDraftReadiness(
      { ...INITIAL_STOCK_DRAFT, quantity: "20", reason: "Old reason" },
      balance,
      [],
    ).error,
  ).toBe("Choose 1–10 categories.")
  expect(
    stockDraftReadiness(
      { ...review.draft, mode: "count", reason: "" },
      balance,
      [],
    ).error,
  ).toContain("reason")
  const command = stockCommand(
    {
      ...review,
      draft: { ...review.draft, mode: "count", reason: "Physical count" },
    },
    "count-request",
  )
  if (command.kind !== "count") throw new Error("Expected count")
  expect(command.input.actorNote).toBe("Physical count")
})
