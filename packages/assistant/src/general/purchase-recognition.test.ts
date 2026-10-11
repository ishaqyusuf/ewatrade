import { expect, test } from "bun:test"
import {
  generalActionSchema,
  generalActionSummary,
  generalReceiptSchema,
} from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
import { purchaseRecognitionDraftInstructions } from "./purchase-recognition"

const invoice = {
  action: "purchase_recognize",
  bookId: "book",
  recognitionId: "agreement",
  stage: "INVOICE",
  effectiveAt: "2026-10-01T12:00:00.123Z",
  reference: "INV-1",
  factConfirmed: true,
  invoiceAmountMinor: "1100",
}
const ownership = {
  ...invoice,
  stage: "OWNERSHIP",
  invoiceAmountMinor: undefined,
}

test("recognition requires an explicit independent fact with strict source and exact amount", () => {
  expect(generalActionSchema.parse(invoice)).toMatchObject(invoice)
  expect(generalActionSchema.parse(ownership)).toMatchObject({
    stage: "OWNERSHIP",
  })
  expect(
    generalActionSchema.safeParse({
      ...invoice,
      dueAt: "2026-10-02T12:00:00.123Z",
    }).success,
  ).toBe(true)
  for (const change of [
    { stage: "RECEIPT" },
    { factConfirmed: false },
    { factConfirmed: undefined },
    { invoiceAmountMinor: undefined },
    { invoiceAmountMinor: "0" },
    { invoiceAmountMinor: "11.00" },
    { invoiceAmountMinor: "1e3" },
    { invoiceAmountMinor: "100000000000001" },
    { reference: " " },
    { effectiveAt: "yesterday" },
    { bookId: "" },
    { recognitionId: "" },
    { dueAt: "2026-09-30T12:00:00Z" },
    { supplierId: "new" },
    { storeId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "key" },
    { receipts: [] },
    { lines: [] },
  ])
    expect(
      generalActionSchema.safeParse({ ...invoice, ...change }).success,
    ).toBe(false)
  for (const change of [
    { invoiceAmountMinor: "1100" },
    { dueAt: "2026-10-02T12:00:00Z" },
  ])
    expect(
      generalActionSchema.safeParse({ ...ownership, ...change }).success,
    ).toBe(false)
})

test("recognition has dashboard finance authority and receipts open the owning agreement", () => {
  expect(capabilityForAction("purchase_recognize")).toMatchObject({
    id: "finance.purchase.recognize",
    rollout: "source",
    clients: ["dashboard"],
    scope: "book",
    policy: { roles: ["OWNER", "ADMIN"] },
    receipt: "finance_purchase_registration",
  })
  const receipt = {
    kind: "finance_purchase_registration",
    recordId: "agreement",
    title: "Invoice recognized",
    detail: "No stock or payment.",
  }
  expect(generalReceiptSchema.safeParse(receipt).success).toBe(false)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, bookId: "book" }).success,
  ).toBe(true)
  expect(
    generalActionSummary(generalActionSchema.parse(invoice), "NGN"),
  ).toContain("invoice")
  expect(
    generalActionSummary(generalActionSchema.parse(ownership), "NGN"),
  ).toContain("ownership")
  expect(purchaseRecognitionDraftInstructions).toContain(
    "Never infer ownership",
  )
  expect(purchaseRecognitionDraftInstructions).toContain("split deliveries")
})

test("physical receipt is explicit whole original goods with no supplied stock revisions, quantities or costs", () => {
  const physical = { ...ownership, stage: "RECEIPT" }
  expect(generalActionSchema.parse(physical)).toMatchObject({
    stage: "RECEIPT",
    factConfirmed: true,
  })
  for (const fields of [
    { invoiceAmountMinor: "1100" },
    { dueAt: "2026-10-02T12:00:00Z" },
    { receipts: [{ lineId: "line", expectedBalanceRevision: 0 }] },
    { quantity: "2.125" },
    { amountMinor: "1100" },
    { factConfirmed: false },
    { storeId: "other" },
  ])
    expect(
      generalActionSchema.safeParse({ ...physical, ...fields }).success,
    ).toBe(false)
  expect(purchaseRecognitionDraftInstructions).toContain(
    "all original agreed goods physically arrived",
  )
  expect(purchaseRecognitionDraftInstructions).toContain(
    "do not infer physical receipt",
  )
})
