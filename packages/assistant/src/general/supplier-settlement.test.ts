import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
import { supplierSettlementDraftInstructions } from "./supplier-settlement"
const base = {
  bookId: "book",
  amountMinor: "300",
  effectiveAt: "2026-10-05T12:00:00.123Z",
  description: "Recorded source",
}
const payloads = [
  {
    ...base,
    action: "supplier_advance",
    supplierId: "supplier",
    moneyAccountId: "cash",
    paymentAlreadyMade: true,
  },
  {
    ...base,
    action: "supplier_advance_allocate",
    billId: "invoice",
    advanceEntryId: "advance",
    allocationConfirmed: true,
  },
  {
    ...base,
    action: "purchase_payment",
    billId: "invoice",
    moneyAccountId: "cash",
    reference: "PARTIAL",
    paymentAlreadyMade: true,
  },
]
test("supplier settlement actions retain independent source and explicit money/allocation facts", () => {
  for (const p of payloads) {
    expect(generalActionSchema.safeParse(p).success).toBe(true)
    for (const change of [
      { amountMinor: "0" },
      { amountMinor: "100000000000001" },
      { amountMinor: "1e3" },
      { amountMinor: "2.5" },
      { tenantId: "other" },
      { actorUserId: "other" },
      { clientCommandId: "supplied" },
      { storeId: "other" },
      { description: " " },
      { effectiveAt: "yesterday" },
    ])
      expect(generalActionSchema.safeParse({ ...p, ...change }).success).toBe(
        false,
      )
    expect(
      capabilityForAction(
        p.action as
          | "supplier_advance"
          | "supplier_advance_allocate"
          | "purchase_payment",
      ),
    ).toMatchObject({
      rollout: "planned",
      scope: "book",
      clients: ["dashboard"],
      policy: { roles: ["OWNER", "ADMIN"] },
    })
  }
  expect(
    generalActionSchema.safeParse({ ...payloads[0], paymentAlreadyMade: false })
      .success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({
      ...payloads[1],
      allocationConfirmed: false,
    }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...payloads[1], moneyAccountId: "cash" })
      .success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...payloads[2], advanceEntryId: "advance" })
      .success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...payloads[0], billId: "invoice" })
      .success,
  ).toBe(false)
})
test("draft instructions require existing source resolution and distinguish advances, allocation and paid settlement", () => {
  for (const phrase of [
    "readSupplierStatement",
    "bounded statement history",
    "allocationConfirmed=true",
    "paymentAlreadyMade=true",
    "Never substitute a new purchase",
    "None of these actions send money",
  ])
    expect(supplierSettlementDraftInstructions).toContain(phrase)
})

test("purchase invoice receipts require their exact Book and retain a separate source kind", () => {
  const receipt = {
    kind: "finance_purchase_bill",
    recordId: "bill",
    bookId: "book",
    title: "Purchase payment recorded",
    detail: "Partial payment",
  }
  expect(generalReceiptSchema.safeParse(receipt).success).toBe(true)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, bookId: undefined }).success,
  ).toBe(false)
})
