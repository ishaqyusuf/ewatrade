import { expect, test } from "bun:test"
import { purchaseRecognitionReviewLines } from "./general-purchase-recognition"

const review: Parameters<typeof purchaseRecognitionReviewLines>[0] = {
  bookId: "book", currencyCode: "NGN", startsAt: "2026-01-01T00:00:00.000Z", closedThrough: null,
  recognitionId: "agreement", supplierId: "supplier", supplierName: "Recorded supplier",
  storeId: "store", storeName: "Bakery", description: "Flour agreement", agreedAt: "2026-10-01T00:00:00.123Z",
  stage: "INVOICE", effectiveAt: "2026-10-02T00:00:00.123Z", reference: "INV-1", dueAt: "2026-10-03T00:00:00.123Z",
  totalMinor: "1100", payableIncreaseMinor: "1100", invoiceBillWillBeCreated: true,
  goods: [{ lineId: "line", description: "Flour", amountMinor: "1100", enteredQuantity: "2.125", enteredUnitName: "bag", balanceSourceId: "balance", configurationVersionId: "config" }],
  priorEvents: [],
  debit: { accountId: null, code: "1340", accountName: "Billed goods awaiting ownership", willCreate: true },
  credit: { accountId: "payable", code: "2000", accountName: "Supplier payable", willCreate: false },
  stockEffect: "NONE", moneyTransfer: "NOT_PERFORMED", matching: "EXACT_WHOLE_DOCUMENT",
}

test("invoice review discloses exact costs, original supplier/Store, accounts, date and payable", () => {
  const lines = purchaseRecognitionReviewLines(review).join(" ")
  for (const text of ["2.125 bag", "Recorded supplier", "Bakery", "1340 Billed goods awaiting ownership (created on confirmation)", "2000 Supplier payable", review.effectiveAt, review.dueAt!, "INV-1", "creates one purchase invoice and payable", "does not declare ownership", "No money is sent"])
    expect(lines).toContain(text)
})

test("ownership review describes transit movement and no second payable or physical receipt", () => {
  const lines = purchaseRecognitionReviewLines({ ...review, stage: "OWNERSHIP", dueAt: null, payableIncreaseMinor: "0", invoiceBillWillBeCreated: false,
    debit: { accountId: null, code: "1310", accountName: "Owned goods in transit", willCreate: true },
    credit: { accountId: "billed", code: "1340", accountName: "Billed goods", willCreate: false },
    priorEvents: [{ eventId: "invoice", stage: "INVOICE", effectiveAt: review.effectiveAt, journalEntryId: "journal", sequence: "1", invoiceBillId: "bill", reference: "INV-1" }],
  }).join(" ")
  for (const text of ["ownership of agreed goods", "1310 Owned goods in transit", "1340 Billed goods", "Previously recorded facts: INVOICE", "creates no new supplier payable", "No money is sent", "split deliveries"])
    expect(lines).toContain(text)
  expect(lines).not.toContain("Due:")
})
