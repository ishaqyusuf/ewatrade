import { expect, test } from "bun:test"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  INITIAL_STOCK_DRAFT,
  type StockBalance,
  type StockReview,
  stockCommand,
  stockDraftReadiness,
  stockFactsLabel,
  stockKindLabel,
  stockQuantityLine,
  stockReferenceRow,
  stockResultEffectiveAt,
  stockResultOperationId,
  stockReviewLedger,
} from "./stock-intake-model"

const balance: StockBalance = {
  availableQuantity: "500",
  balanceSourceId: "balance",
  catalogItemId: "catalog-layers",
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

test("labels on hand, reserved and available separately in the balance unit", () => {
  expect(
    stockFactsLabel({
      ...balance,
      availableQuantity: "0",
      onHandQuantity: "12",
      reservedQuantity: "12",
    }),
  ).toBe("12 on hand · 12 reserved · 0 available birds")
})

test("keeps shared and packaged balances distinct", () => {
  expect(stockKindLabel(balance)).toBe("Shared stock")
  expect(stockKindLabel({ kind: "PACKAGED_STOCK" })).toBe("Packaged stock")
})

const reviewOf = (
  patch: Partial<StockReview["draft"]>,
  quantity: string,
  balancePatch: Partial<StockBalance> = {},
): StockReview => ({
  balance: {
    ...balance,
    onHandQuantity: "40",
    reservedQuantity: "6",
    availableQuantity: "34",
    ...balancePatch,
  },
  draft: { ...INITIAL_STOCK_DRAFT, balanceId: "balance", ...patch },
  quantity,
  recipientName: "Central store",
  businessId: "business",
  userId: "user",
  storeId: "store",
})

test("ledger keeps on hand, reserved and available apart", () => {
  expect(stockReviewLedger(reviewOf({ mode: "receipt" }, "10"))).toEqual({
    onHand: ["40", parseExactDecimal("50")],
    reserved: ["6", "6"],
    available: ["34", "44"],
    difference: "+10",
  })
  const count = stockReviewLedger(reviewOf({ mode: "count" }, "38"))
  expect(count.onHand).toEqual(["40", parseExactDecimal("38")])
  expect(count.difference).toBe("−2")
  const transit = stockReviewLedger(
    reviewOf({ mode: "receipt" }, "1", { custodyType: "TRANSIT" }),
  )
  expect(transit.available[1]).toBe("0")
  const tooMuch = stockReviewLedger(
    reviewOf({ mode: "adjustment", direction: "decrease" }, "41"),
  )
  expect(tooMuch.onHand[1]).toBeNull()
  expect(tooMuch.available[1]).toBeNull()
})

test("names the exact movement for review and outcome", () => {
  expect(stockQuantityLine({ ...INITIAL_STOCK_DRAFT }, "10", "bag")).toBe(
    "Receive 10 bag",
  )
  expect(
    stockQuantityLine(
      { ...INITIAL_STOCK_DRAFT, mode: "adjustment", direction: "decrease" },
      "2",
      "bag",
    ),
  ).toBe("Decrease 2 bag")
  expect(
    stockQuantityLine({ ...INITIAL_STOCK_DRAFT, mode: "count" }, "38", "bag"),
  ).toBe("Counted 38 bag")
})

test("reads only a real saved time from a mutation result", () => {
  expect(
    stockResultEffectiveAt({
      effectiveAt: "2026-10-17T09:42:00.000Z",
    })?.toISOString(),
  ).toBe("2026-10-17T09:42:00.000Z")
  expect(stockResultEffectiveAt({ id: "op" })).toBeNull()
  expect(stockResultEffectiveAt({ effectiveAt: "not a date" })).toBeNull()
  expect(stockResultEffectiveAt(null)).toBeNull()
})

test("reads the saved reference only from the actual response id", () => {
  // Canonical serializeOperation for receipt/adjustment, finalized Count and
  // custody: the id is the saved operation, distinct from client ids.
  const saved = {
    id: "cmh2x9k1z0001qv8f3a7b5c2d",
    clientOperationId: "stock-5f0c7a4e-client",
    effectiveAt: "2026-10-17T10:00:00.000Z",
  }
  expect(stockResultOperationId(saved)).toBe("cmh2x9k1z0001qv8f3a7b5c2d")
  expect(stockResultOperationId({ ...saved, id: "  op_12-AB  " })).toBe(
    "op_12-AB",
  )
  // Never falls back to client, final or Count draft ids.
  expect(
    stockResultOperationId({
      clientOperationId: "stock-client",
      finalId: "count-final-x",
      stockCountId: "count-draft",
    }),
  ).toBeNull()
  for (const id of [
    undefined,
    null,
    42,
    "",
    "   ",
    "op 1",
    "op/1",
    "<script>",
    "a".repeat(129),
    { id: "nested" },
  ])
    expect(stockResultOperationId({ ...saved, id })).toBeNull()
  expect(stockResultOperationId(null)).toBeNull()
  expect(stockResultOperationId("cmh2x9k1z")).toBeNull()
  expect(stockResultOperationId({ id: "a".repeat(128) })).toBe("a".repeat(128))
})

test("the recorded reference row stays truthful when the id is unreadable", () => {
  expect(stockReferenceRow("cmh2x9k1z0001qv8f3a7b5c2d")).toEqual([
    "Reference",
    "cmh2x9k1z0001qv8f3a7b5c2d",
    { selectable: true },
  ])
  const [label, value, options] = stockReferenceRow(null)
  expect(label).toBe("Reference")
  expect(options).toEqual({ selectable: false })
  expect(value).toContain("the change is saved")
  expect(value).not.toMatch(/fail|not recorded|unknown/i)
})
