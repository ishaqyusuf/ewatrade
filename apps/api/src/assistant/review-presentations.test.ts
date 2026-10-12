import { expect, test } from "bun:test"
import {
  type GeneralReviewPresentation,
  generalReviewPresentationSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  closeoutCreatePresentation,
  closeoutFinalizePresentation,
  saleReviewPresentation,
  stockAdjustPresentation,
  stockCorrectPresentation,
  stockCountCreatePresentation,
  stockCountFinalizePresentation,
  stockReceivePresentation,
  stockTransferDispatchPresentation,
  stockTransferTransitionPresentation,
} from "./review-presentations"

const valid = (p: GeneralReviewPresentation) => {
  const parsed = generalReviewPresentationSchema.safeParse(p)
  if (!parsed.success) throw Error(JSON.stringify(parsed.error.issues))
  return p
}
const cost = {
  status: "KNOWN",
  currencyCode: "NGN",
  valueBeforeMinor: "60000",
  valueAfterMinor: "48000",
  valueDeltaMinor: "-12000",
}
const stock = {
  productName: "Quail eggs",
  variantName: "Default",
  enteredQuantity: "2",
  enteredUnitName: "tray",
  factor: "30",
  canonicalQuantity: "60",
  before: "150",
  after: "210",
  balanceUnitName: "piece",
  reserved: "0",
  availableAfter: "210",
  currencyCode: "NGN",
}

test("a sale reads customer, total, payment and its lines", () => {
  const p = valid(
    saleReviewPresentation({
      rows: [
        {
          title: "Quail eggs",
          detail: "Tray",
          quantity: "2",
          unitPriceMinor: 240000,
          totalMinor: 480000,
        },
        { title: "Delivery", detail: "typed price", totalMinor: 50000 },
      ],
      totalMinor: 530000,
      currencyCode: "NGN",
      customerName: "Bola Okafor",
      payment: {
        amountMinor: 300000,
        method: "bank_transfer",
        accountName: null,
      },
    }),
  )
  expect(p.summary).toEqual({
    party: "Bola Okafor",
    amount: "₦5,300.00",
    amountLabel: "sale",
  })
  expect(p.facts).toEqual([
    { label: "Paid", value: "₦3,000.00 · bank transfer" },
    { label: "Still owed", value: "₦2,300.00" },
  ])
  expect(p.table?.rows).toEqual([
    {
      cells: ["Quail eggs", "2", "₦4,800.00"],
      detail: "Tray · 2 × ₦2,400.00",
    },
    { cells: ["Delivery", "—", "₦500.00"], detail: "typed price" },
  ])
  expect(p.note).toContain("No bank transfer or card charge is initiated.")
})

test("an unpaid sale says what is still owed", () => {
  const p = valid(
    saleReviewPresentation({
      rows: [
        {
          title: "Bread",
          quantity: "1",
          unitPriceMinor: 1000,
          totalMinor: 1000,
        },
      ],
      totalMinor: 1000,
      currencyCode: "NGN",
      customerName: "Walk-in",
    }),
  )
  expect(p.facts).toEqual([
    { label: "Still owed", value: "₦10.00 · no payment" },
  ])
  expect(p.note).toBeUndefined()
})

test("a stock receipt reads the item, quantity and on-hand change", () => {
  const p = valid(
    stockReceivePresentation(stock, {
      reason: "Weekly delivery",
      source: "supplier_delivery",
      supplierName: "Mama Bisi Farms",
      categories: [{ name: "Eggs" }],
      effectiveAt: "2026-10-12T09:00:00.000Z",
    }),
  )
  expect(p.summary).toEqual({
    party: "Quail eggs · Default",
    context: "Weekly delivery",
    amount: "+2 tray",
    amountLabel: "received",
  })
  expect(p.facts).toContainEqual({ label: "On hand", value: "150 → 210 piece" })
  expect(p.facts).toContainEqual({ label: "Unit cost", value: "unknown" })
  expect(p.facts).toContainEqual({ label: "Effective", value: "12 Oct 2026" })
  expect(p.sections?.[0]?.chips).toEqual([{ label: "Eggs" }])
  expect(p.sections?.[0]?.summary).toBe("Supplier delivery")
})

test("waste reads as a decrease with its value change", () => {
  const p = valid(
    stockAdjustPresentation(
      { ...stock, after: "90", availableAfter: "90", cost },
      {
        purpose: "waste",
        direction: "decrease",
        reason: "Cracked in transit",
        categories: [{ name: "Breakage" }],
      },
    ),
  )
  expect(p.summary.amount).toBe("−2 tray")
  expect(p.summary.amountLabel).toBe("waste")
  expect(p.facts).toContainEqual({ label: "Value", value: "₦600.00 → ₦480.00" })
})

test("a correction lists was/now per line and keeps a long reason in limits", () => {
  const p = valid(
    stockCorrectPresentation(
      {
        targetOperationId: "op1",
        originalType: "RECEIPT",
        originalReason: "x".repeat(400),
        lines: [
          {
            productName: "Quail eggs",
            variantName: "Default",
            originalEnteredQuantity: "5",
            correctedQuantity: "3",
            enteredUnitName: "tray",
            before: "150",
            afterReplacement: "90",
            reserved: "0",
            availableAfter: "90",
            cost,
          },
        ],
      },
      { reason: "Typed 5 instead of 3" },
    ),
  )
  expect(p.summary.party).toBe("Correct a receipt")
  expect(p.table?.rows[0]?.cells).toEqual([
    "Quail eggs",
    "5 tray",
    "3 tray",
    "150 → 90",
  ])
  expect(p.facts?.[0]?.value.length).toBeLessThanOrEqual(160)
})

const counted = (variance: string) => ({
  productName: "Quail eggs",
  variantName: "Default",
  expectedQuantity: "150",
  observedQuantity: "149",
  declaredQuantity: "149",
  varianceQuantity: variance,
  unitName: "piece",
  reservedQuantity: "0",
  availableAfter: "149",
  custodyType: "SHELF",
  custodyReferenceId: null,
  preservesReservations: variance !== "-5",
})

test("a stock count shows system, counted and signed variance", () => {
  const create = valid(
    stockCountCreatePresentation([counted("-1"), counted("0"), counted("2")], {
      reason: "Month end",
    }),
  )
  expect(create.summary.party).toBe("Count 3 items")
  expect(create.facts?.[0]).toEqual({ label: "Differences", value: "2" })
  expect(create.table?.rows.map((row) => row.cells[3])).toEqual([
    "-1",
    "0",
    "+2",
  ])
  const finalize = valid(
    stockCountFinalizePresentation(
      { reason: null, lines: [counted("0")] },
      { reason: "Agreed with manager" },
    ),
  )
  expect(finalize.facts).toEqual([
    { value: "No differences" },
    { label: "Counted for", value: "Not recorded" },
  ])
})

test("a closeout flags declarations below reserved stock", () => {
  const create = valid(
    closeoutCreatePresentation([counted("-5"), counted("0")], {
      custodyType: "SHIFT",
      custodyReferenceId: "Morning",
      reason: "End of shift",
    }),
  )
  expect(create.summary.party).toBe("Shift closeout · Morning")
  expect(create.facts).toContainEqual({
    label: "Below reserved",
    value: "1 · blocks finalizing",
  })
  const finalize = valid(
    closeoutFinalizePresentation(
      { custodyType: "SHIFT", reason: "End of shift", lines: [counted("0")] },
      { reason: "Reconciled" },
    ),
  )
  expect(finalize.table?.columns.map((column) => column.label)).toEqual([
    "Item",
    "System",
    "Declared",
    "Variance",
  ])
})

const stores = {
  productName: "Quail Eggs",
  variantName: "Default",
  unitName: "Piece",
  sourceStore: { name: "Main store" },
  targetStore: { name: "Ikeja branch" },
}

test("a transfer dispatch reads quantity, route and transit", () => {
  const p = valid(
    stockTransferDispatchPresentation(
      {
        ...stores,
        quantity: "30",
        factor: "1",
        canonicalQuantity: "30",
        before: "149",
        after: "119",
        reserved: "1",
        availableAfter: "118",
        inTransitAfter: "30",
      },
      { reason: "Restock Ikeja" },
      "Same currency; no money moves.",
    ),
  )
  expect(p.summary).toEqual({
    party: "Quail Eggs · Default",
    context: "Main store → Ikeja branch · Restock Ikeja",
    amount: "30 Piece",
    amountLabel: "to send",
  })
  expect(p.facts).toContainEqual({ label: "At Main store", value: "149 → 119" })
  expect(p.sections?.[0]?.note).toContain("Same currency; no money moves.")
})

test("receiving and returning name the store and keep earlier history", () => {
  const transition = {
    ...stores,
    plan: { quantity: "20", remainingBefore: "30", remainingAfter: "10" },
    dispatchedQuantity: "30",
    targetBefore: "5",
    targetAfter: "25",
    targetReserved: "0",
    acknowledgments: [
      {
        kind: "RECEIVE",
        quantity: "0",
        remainingAfter: "30",
        reason: "None yet",
      },
    ],
  }
  const receive = valid(
    stockTransferTransitionPresentation(
      transition,
      { reason: "Counted at Ikeja" },
      true,
      "No money moves.",
    ),
  )
  expect(receive.summary.amountLabel).toBe("received at Ikeja branch")
  expect(receive.facts).toContainEqual({
    label: "In transit",
    value: "30 → 10",
  })
  expect(receive.sections?.[0]?.rows?.[0]?.label).toBe("Received")
  const back = valid(
    stockTransferTransitionPresentation(
      { ...transition, acknowledgments: [] },
      { reason: "Not needed" },
      false,
      "No money moves.",
    ),
  )
  expect(back.summary.amountLabel).toBe("returned to Main store")
  expect(back.sections).toEqual([])
})
