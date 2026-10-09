import { expect, test } from "bun:test"
import { financeDisplayDate } from "./finance-display"
test("bookkeeping dates remain in UTC and unknown dates remain explicit", () => {
  expect(financeDisplayDate("invalid")).toBe("Date unavailable")
  expect(financeDisplayDate("2026-10-09T00:00:00Z")).toContain("9")
  expect(financeDisplayDate("2026-10-09T00:00:00Z", true)).not.toContain("T00:")
})
