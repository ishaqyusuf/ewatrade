import { expect, test } from "bun:test"
import { generalReviewPresentationSchema } from "@ewatrade/assistant/general/contracts"
import { purchaseRecordingPresentation } from "./purchase-recording-presentation"

type Review = Parameters<typeof purchaseRecordingPresentation>[0]
const good = (n: number, known: boolean, newCategory: boolean) => ({
  description: `Delivery line ${n}`,
  amountMinor: String(100_00 * n),
  enteredQuantity: "2",
  enteredUnitName: "bag",
  stock: {
    productName: `Flour ${n}`,
    variantName: "50kg bag",
    before: "6",
    after: "8",
    balanceUnitName: "bag",
    reserved: "0",
    availableAfter: "8",
  },
  categories: [
    { categoryNameId: 1, name: "Baking supplies", willCreate: false },
    ...(newCategory
      ? [{ categoryNameId: null, name: "Packaging", willCreate: true }]
      : []),
  ],
  valuation: {
    status: known ? "KNOWN" : "UNKNOWN",
    sourceCostMinor: String(100_00 * n),
    quantityBefore: "6",
    quantityAfter: "8",
    valueBeforeMinor: known ? "60000" : null,
    valueAfterMinor: known ? "80000" : null,
    unknownReason: known ? null : "MISSING_OPENING_COST",
  },
})
const review = {
  currencyCode: "NGN",
  supplierName: "Lagos Flour Mills",
  supplierCode: "LFM-01",
  description: "Weekly baking stock",
  reference: "INV-2291",
  incurredAt: "2026-10-12T00:00:00.000Z",
  dueAt: "2026-10-20T00:00:00.000Z",
  totalMinor: "60000",
  journal: [
    {
      code: "1300",
      accountName: "Inventory",
      debitMinor: "60000",
      creditMinor: "0",
    },
    {
      code: "2000",
      accountName: "Supplier and expense payables",
      debitMinor: "0",
      creditMinor: "60000",
    },
  ],
  goods: [good(1, true, false), good(2, false, true), good(3, true, true)],
} as unknown as Review

test("a purchase review reads supplier, payable, dates, goods and folds", () => {
  const p = purchaseRecordingPresentation(review)
  expect(generalReviewPresentationSchema.safeParse(p).success).toBe(true)
  expect(p.summary).toEqual({
    party: "Lagos Flour Mills (LFM-01)",
    context: "Weekly baking stock",
    amount: "₦600.00",
    amountLabel: "payable",
  })
  expect(p.facts).toEqual([
    { label: "Bill", value: "12 Oct 2026" },
    { label: "Due", value: "20 Oct 2026" },
    { label: "Ref", value: "INV-2291" },
    { value: "3 goods received" },
  ])
  expect(p.table?.rows[1]).toEqual({
    cells: ["Flour 2", "2 bag", "₦200.00"],
    detail: "50kg bag · Delivery line 2",
  })
  expect(p.table?.total).toEqual({ label: "Total", value: "₦600.00" })
  const [stock, accounting] = p.sections ?? []
  expect(stock?.summary).toBe("3 items · 1 new category")
  expect(stock?.chips).toEqual([
    { label: "Baking supplies", isNew: false },
    { label: "Packaging", isNew: true },
  ])
  expect(stock?.rows?.[1]?.detail).toContain(
    "Value unknown (MISSING_OPENING_COST)",
  )
  expect(accounting?.summary).toBe(
    "Inventory Dr · Supplier and expense payables Cr",
  )
  expect(accounting?.rows).toEqual([
    { label: "1300 Inventory", value: "Dr ₦600.00" },
    { label: "2000 Supplier and expense payables", value: "Cr ₦600.00" },
  ])
})

test("a purchase without due date or reference omits those facts", () => {
  const p = purchaseRecordingPresentation({
    ...review,
    dueAt: null,
    reference: null,
    goods: [good(1, true, false)],
  } as unknown as Review)
  expect(p.facts).toEqual([
    { label: "Bill", value: "12 Oct 2026" },
    { value: "1 good received" },
  ])
  expect(p.sections?.[0]?.summary).toBe("1 item")
})

test("many new categories stay within the card limits", () => {
  const many = Array.from({ length: 10 }, (_, n) => ({
    ...good(n + 1, true, false),
    categories: Array.from({ length: 10 }, (_, c) => ({
      categoryNameId: null,
      name: `Category ${n}-${c}`,
      willCreate: true,
    })),
  }))
  const p = purchaseRecordingPresentation({
    ...review,
    goods: many,
  } as unknown as Review)
  expect(generalReviewPresentationSchema.safeParse(p).success).toBe(true)
  const chips = p.sections?.[0]?.chips ?? []
  expect(chips).toHaveLength(31)
  expect(chips.at(-1)).toEqual({ label: "+ 70 more" })
  expect(p.sections?.[0]?.summary).toBe("10 items · 100 new categories")
})
