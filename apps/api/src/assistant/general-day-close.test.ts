import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import {
  cashCountTargetSchema,
  dayCloseTargetSchema,
} from "../../../../packages/assistant/src/general/cash-count-target"
import type { getFinanceCashCountInTransaction } from "../../../../packages/db/src/queries/finance/cash-counts"
import type { getFinancePeriodCloseChecklistInTransaction } from "../../../../packages/db/src/queries/finance/period-close-checklist"
import {
  generalCashCountAnswer,
  generalDayCloseAnswer,
} from "./general-day-close"
const checklist = {
  bookId: "original-book",
  currencyCode: "NGN",
  from: new Date("2026-10-01Z"),
  through: new Date("2026-10-10T23:59:59.999Z"),
  snapshotSequence: "45",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
  cashCountCoverageComplete: false,
  cashCommandCoverageComplete: false,
  checks: Array.from({ length: 200 }, (_, i) => ({
    id: `check-${i}`,
    label: `Unresolved ${i}`,
    status: "REVIEW_REQUIRED",
    explanation: "Uncertified source",
  })),
} as unknown as Awaited<
  ReturnType<typeof getFinancePeriodCloseChecklistInTransaction>
>
test("day-close answer stays bounded and never converts unresolved checks into acceptance", () => {
  const answer = generalDayCloseAnswer(checklist)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  const { target, ...stored } = answer
  expect(
    generalAnswerSchema.omit({ target: true }).safeParse(stored).success,
  ).toBe(true)
  expect(dayCloseTargetSchema.parse(target)).toEqual({
    kind: "finance_day_close",
    bookId: "original-book",
    through: "2026-10-10T23:59:59.999Z",
  })
  expect(answer.value).toBe("200 unresolved checks")
  expect(answer.detail).toContain("Assistant close/reopen unavailable")
  expect(answer.detail).toContain("coverage: incomplete")
  expect(answer.detail).toContain("Full checklist in object")
  expect(answer.detail.length).toBeLessThanOrEqual(1000)
})
test("exact count answer preserves original observation and changed-history status", () => {
  const original = {
    bookId: "original-book",
    id: "original-count",
    accountName: "Front till",
    asOf: new Date("2026-10-10T23:59:59.999Z"),
    snapshotSequence: "42",
    observedBalanceMinor: "0",
    expectedBalanceMinor: "4850000",
    differenceMinor: "-4850000",
    currencyCode: "NGN",
    reviewRequired: true,
    status: "REVIEW_REQUIRED",
  } as unknown as Awaited<ReturnType<typeof getFinanceCashCountInTransaction>>
  const answer = generalCashCountAnswer(original)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  const { target, ...stored } = answer
  expect(
    generalAnswerSchema.omit({ target: true }).safeParse(stored).success,
  ).toBe(true)
  expect(cashCountTargetSchema.parse(target)).toEqual({
    kind: "finance_cash_count",
    bookId: "original-book",
    countId: "original-count",
  })
  expect(answer.value).toContain("0.00")
  expect(answer.detail).toContain("original difference -₦48,500.00")
  expect(answer.detail).toContain("Later postings changed")
  expect(answer.detail).toContain("No adjustment or close")
})
