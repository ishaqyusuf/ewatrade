import { describe, expect, test } from "bun:test"
import {
  type FinanceCloseChecklistEvidence,
  assertFinanceCloseChecklistScope,
  financeCloseChecklistCanProceed,
  financeCloseChecklistMatchesReview,
} from "./finance-close-checklist"

const checklist: FinanceCloseChecklistEvidence = {
  bookId: "book-1",
  currencyCode: "USD",
  from: "2026-09-01T00:00:00.000Z",
  through: "2026-09-30T23:59:59.999Z",
  snapshotSequence: "184",
  dateLockEligible: true,
  operationallyReconciled: false,
  checks: [
    { id: "POSTED_TRIAL_BALANCE", status: "PASS" },
    { id: "CASH_RECONCILIATION", status: "REVIEW_REQUIRED" },
  ],
  trialBalance: { balanced: true, differenceMinor: "0" },
}

describe("finance close checklist scope", () => {
  test("accepts only the exact book, currency, range, watermark and non-reconciliation claim", () => {
    expect(() =>
      assertFinanceCloseChecklistScope({
        checklist,
        bookId: "book-1",
        currencyCode: "USD",
        from: new Date("2026-09-01T00:00:00.000Z"),
        through: new Date("2026-09-30T23:59:59.999Z"),
        snapshotSequence: "184",
      }),
    ).not.toThrow()
    expect(() =>
      assertFinanceCloseChecklistScope({
        checklist,
        bookId: "book-1",
        currencyCode: "USD",
        from: "2026-09-01T00:00:00.000Z",
        through: "2026-09-30T23:59:59.999Z",
        snapshotSequence: "185",
      }),
    ).toThrow("checklist changed")
  })

  test("allows date locking with visible review-required checks but never with blockers", () => {
    expect(financeCloseChecklistCanProceed(checklist)).toBe(true)
    expect(
      financeCloseChecklistCanProceed({
        ...checklist,
        checks: [{ id: "CASH_RECONCILIATION", status: "BLOCKED" }],
      }),
    ).toBe(false)
    expect(
      financeCloseChecklistCanProceed({
        ...checklist,
        dateLockEligible: false,
      }),
    ).toBe(false)
    expect(
      financeCloseChecklistCanProceed({
        ...checklist,
        trialBalance: { balanced: false, differenceMinor: "1" },
      }),
    ).toBe(false)
  })

  test("requires cash and source evidence to remain identical to the reviewed snapshot", () => {
    expect(financeCloseChecklistMatchesReview(checklist, checklist)).toBe(true)
    expect(
      financeCloseChecklistMatchesReview(
        {
          ...checklist,
          checks: [{ id: "CASH_RECONCILIATION", status: "BLOCKED" }],
        },
        checklist,
      ),
    ).toBe(false)
  })
})

test("close checklist rejects cross-scope, date-range and reconciliation claims", () => {
  const expected = {
    bookId: checklist.bookId,
    currencyCode: checklist.currencyCode,
    from: checklist.from,
    through: checklist.through,
    snapshotSequence: checklist.snapshotSequence,
  }
  for (const changed of [
    { ...expected, bookId: "other-book" },
    { ...expected, currencyCode: "NGN" },
    { ...expected, from: "2026-09-02T00:00:00.000Z" },
    { ...expected, through: "2026-09-29T23:59:59.999Z" },
    { ...expected, through: "invalid-date" },
  ])
    expect(() =>
      assertFinanceCloseChecklistScope({ checklist, ...changed }),
    ).toThrow("checklist changed")
  expect(() =>
    assertFinanceCloseChecklistScope({
      ...expected,
      checklist: JSON.parse(
        JSON.stringify({ ...checklist, operationallyReconciled: true }),
      ),
    }),
  ).toThrow("checklist changed")
  const reviewed = {
    ...checklist,
    cash: [
      { accountId: "cash", countId: "count-1", observedBalanceMinor: "1000" },
    ],
  }
  const changedCount = {
    ...reviewed,
    cash: [
      { accountId: "cash", countId: "count-2", observedBalanceMinor: "1000" },
    ],
  }
  const changedAmount = {
    ...reviewed,
    cash: [
      { accountId: "cash", countId: "count-1", observedBalanceMinor: "900" },
    ],
  }
  expect(financeCloseChecklistMatchesReview(changedCount, reviewed)).toBe(false)
  expect(financeCloseChecklistMatchesReview(changedAmount, reviewed)).toBe(
    false,
  )
})
