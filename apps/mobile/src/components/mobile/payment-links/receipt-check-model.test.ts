import { expect, test } from "bun:test"
import {
  RECEIPT_CHECK_ADVISORY,
  type ReceiptAssessment,
  receiptCheckView,
  receiptExtractionFacts,
} from "./receipt-check-model"

const base: ReceiptAssessment = {
  state: "complete",
  generation: 1,
  pipelineVersion: "manual-receipt-v2",
  completedAt: "2026-10-27T09:45:00.000Z",
  amountMinor: 500_000,
  currencyCode: "NGN",
  recipientLast4: "6789",
  unavailableReason: null,
  disposition: "consistent",
  findings: [],
  fundsConfirmed: false,
}

test("no assessment shows nothing", () => {
  expect(receiptCheckView(null)).toBeNull()
  expect(receiptCheckView(undefined)).toBeNull()
})

test("pending and checking are in progress and never block", () => {
  for (const state of ["pending", "checking"] as const) {
    const view = receiptCheckView({ ...base, state, disposition: null })
    expect(view?.inProgress).toBe(true)
    expect(view?.message).toContain("You don't need to wait")
    expect(view?.facts).toEqual([])
  }
})

test("unavailable explains the reason without a retry", () => {
  const pdf = receiptCheckView({
    ...base,
    state: "unavailable",
    unavailableReason: "PDF_MANUAL_REVIEW",
  })
  expect(pdf?.title).toBe("Receipt check unavailable")
  expect(pdf?.message).toContain("PDF receipts aren't read automatically.")
  expect(pdf?.inProgress).toBe(false)
  expect(
    receiptCheckView({
      ...base,
      state: "unavailable",
      unavailableReason: "SOMETHING_NEW",
    })?.message,
  ).toContain("couldn't be checked automatically")
})

test("a consistent receipt is still advisory, never a confirmation", () => {
  const view = receiptCheckView(base)
  expect(view?.title).toBe("Receipt details look consistent")
  expect(view?.tone).toBe("muted")
  expect(view?.message).toBe(RECEIPT_CHECK_ADVISORY)
  expect(view?.message).not.toMatch(/verified|confirmed|authentic/i)
  expect(view?.facts).toEqual([
    { label: "Amount on receipt", value: "₦5,000.00" },
    { label: "Receiving account on receipt", value: "••6789" },
  ])
})

test("findings use fixed copy, review first, unknown codes stay generic", () => {
  const view = receiptCheckView({
    ...base,
    disposition: "needs_review",
    amountMinor: null,
    recipientLast4: null,
    findings: [
      { code: "REFERENCE_MATCHED", severity: "info" },
      { code: "AMOUNT_MISMATCH", severity: "review" },
      { code: "AMOUNT_MISMATCH", severity: "review" },
      { code: "<script>", severity: "review" },
    ],
  })
  expect(view?.tone).toBe("warning")
  expect(view?.findings).toEqual([
    {
      severity: "review",
      text: "The amount on the receipt is different from what the customer said.",
    },
    { severity: "review", text: "Another receipt detail needs a check." },
    {
      severity: "info",
      text: "The narration includes the payment reference.",
    },
  ])
  expect(view?.facts.map((fact) => fact.value)).toEqual(["Unknown", "Unknown"])
})

test("the private reading shows unknowns and only the account's last 4", () => {
  const facts = receiptExtractionFacts({
    documentKind: "single_transfer",
    printedStatus: "unknown",
    amountText: "5,000.00",
    currencyCode: "NGN",
    feeText: null,
    recipientAccount: "0123 456 789",
    recipientBank: "GTBank",
    recipientName: " ",
    senderName: null,
    bankReference: null,
    narration: "EWA-ABCDE12345",
    dateRaw: null,
  })
  const value = (label: string) =>
    facts?.find((fact) => fact.label === label)?.value
  expect(value("Amount")).toBe("NGN 5,000.00")
  expect(value("Account")).toBe("••6789")
  expect(value("Paid to")).toBe("Unknown")
  expect(value("Status printed")).toBe("Unknown")
  expect(JSON.stringify(facts)).not.toContain("0123")
  expect(receiptExtractionFacts(null)).toBeNull()
})
