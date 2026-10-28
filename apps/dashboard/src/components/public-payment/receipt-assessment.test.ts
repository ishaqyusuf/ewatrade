import { expect, test } from "bun:test"
import {
  type ReceiptAssessment,
  receiptAmountSuggestion,
  receiptCheckView,
} from "./receipt-assessment"

const base = {
  hasReceipt: true,
  businessName: "Mama Ada",
  claimedAmountMinor: 500_000,
  currencyCode: "NGN",
  accountNumber: "0123456789",
}
const complete = (
  patch: Partial<ReceiptAssessment> = {},
): ReceiptAssessment => ({
  state: "complete",
  generation: 1,
  pipelineVersion: "v1",
  completedAt: new Date("2026-10-28T10:00:00Z"),
  amountMinor: 500_000,
  currencyCode: "NGN",
  recipientLast4: "6789",
  unavailableReason: null,
  disposition: "consistent",
  findings: [],
  fundsConfirmed: false,
  ...patch,
})
const neverConfirms = (text: string) =>
  expect(text).not.toMatch(/payment (is )?(confirmed|verified)/i)

test("no check recorded is never a passed check", () => {
  expect(
    receiptCheckView({ ...base, hasReceipt: false, assessment: null }),
  ).toBeNull()
  const view = receiptCheckView({ ...base, assessment: null })
  expect(view?.title).toBe("Receipt sent")
  expect(view?.title).not.toMatch(/consistent|checked/i)
  expect(view?.canRetry).toBe(false)
})

test("pending and checking say the check is running", () => {
  for (const state of ["pending", "checking"] as const) {
    const view = receiptCheckView({
      ...base,
      assessment: complete({ state, disposition: null }),
    })
    expect(view?.title).toBe("Checking your receipt")
    expect(view?.tone).toBe("wait")
  }
})

test("consistent evidence still says the bank check decides", () => {
  const view = receiptCheckView({ ...base, assessment: complete() })
  expect(view?.title).toBe("Receipt details look consistent")
  expect(view?.body).toContain("doesn't confirm the money arrived")
  expect(view?.body).toContain("₦5,000")
  expect(view?.body).toContain("ending 6789")
  neverConfirms(`${view?.title} ${view?.body}`)
  // Absent fields are left out, not invented.
  const bare = receiptCheckView({
    ...base,
    assessment: complete({ amountMinor: null, recipientLast4: null }),
  })
  expect(bare?.body).not.toContain("The receipt shows")
})

test("an informational reference match alone stays consistent", () => {
  const view = receiptCheckView({
    ...base,
    assessment: complete({
      findings: [{ code: "REFERENCE_MATCHED", severity: "info" }],
    }),
  })
  expect(view?.title).toBe("Receipt details look consistent")
})

test("review findings are listed most important first with server values only", () => {
  const view = receiptCheckView({
    ...base,
    assessment: complete({
      disposition: "needs_review",
      amountMinor: 800_000,
      recipientLast4: "4520",
      findings: [
        { code: "DATE_OLD", severity: "review" },
        { code: "AMOUNT_MISMATCH", severity: "review" },
        { code: "RECIPIENT_MISMATCH", severity: "review" },
        { code: "DUPLICATE_CANDIDATE", severity: "review" },
        { code: "REFERENCE_MATCHED", severity: "info" },
      ],
    }),
  })
  expect(view?.tone).toBe("warn")
  expect(view?.points).toHaveLength(4)
  expect(view?.points[0]).toContain("may have been used for another payment")
  expect(view?.points[1]).toBe(
    "The receipt shows ₦8,000.00. You said ₦5,000.00.",
  )
  expect(view?.points[2]).toContain("ending 4520")
  expect(view?.points[2]).toContain("ends 6789")
  // No extracted date is public, so none is shown.
  expect(view?.points[3]).toBe(
    "The receipt date is older than expected, so the date needs checking.",
  )
  neverConfirms(view?.points.join(" ") ?? "")
})

test("a receipt amount in another currency is not shown as this currency", () => {
  const view = receiptCheckView({
    ...base,
    assessment: complete({
      disposition: "needs_review",
      amountMinor: 800_000,
      currencyCode: "USD",
      findings: [{ code: "AMOUNT_MISMATCH", severity: "review" }],
    }),
  })
  expect(view?.points[0]).toBe(
    "The receipt amount doesn't match the ₦5,000.00 you said.",
  )
})

test("unknown codes and empty review fall back to a manual check", () => {
  const unknown = receiptCheckView({
    ...base,
    assessment: complete({
      disposition: "needs_review",
      findings: [{ code: "SOMETHING_NEW", severity: "review" }],
    }),
  })
  expect(unknown?.points).toEqual(["Something on the receipt needs a check."])
  const empty = receiptCheckView({
    ...base,
    assessment: complete({ disposition: null }),
  })
  expect(empty?.title).toBe("Mama Ada will check your receipt by hand")
})

test("unavailable falls back to the business and retries only eligible reasons", () => {
  const worker = receiptCheckView({
    ...base,
    assessment: complete({
      state: "unavailable",
      disposition: null,
      unavailableReason: "WORKER_UNAVAILABLE",
    }),
  })
  expect(worker?.title).toBe("Receipt check unavailable")
  expect(worker?.canRetry).toBe(true)
  for (const reason of [
    "PDF_MANUAL_REVIEW",
    "BUDGET_UNAVAILABLE",
    "PROCESSING_UNAVAILABLE",
    null,
  ]) {
    const view = receiptCheckView({
      ...base,
      assessment: complete({
        state: "unavailable",
        disposition: null,
        unavailableReason: reason,
      }),
    })
    expect(view?.canRetry).toBe(false)
    expect(view?.body).toContain("check their bank account directly")
  }
})

test("receipt amount is offered only for explicit use after a complete same-currency check", () => {
  const suggest = (patch: Partial<ReceiptAssessment>) =>
    receiptAmountSuggestion({
      assessment: complete(patch),
      currencyCode: "NGN",
      claimedAmountMinor: 500_000,
    })
  expect(suggest({ amountMinor: 550_000 })).toBe(550_000)
  for (const patch of [
    { amountMinor: 0 },
    { amountMinor: -1 },
    { amountMinor: 1.5 },
    { amountMinor: 100_000_001 },
    { amountMinor: null },
    { amountMinor: 500_000 },
    { amountMinor: 550_000, currencyCode: "USD" },
    { amountMinor: 550_000, state: "checking" as const },
  ])
    expect(suggest(patch)).toBeNull()
  const view = receiptCheckView({
    ...base,
    stage: "draft",
    assessment: complete({
      state: "unavailable",
      unavailableReason: "BUDGET_UNAVAILABLE",
    }),
  })
  expect(view?.body).toContain("send")
  neverConfirms(view?.body ?? "")
})
