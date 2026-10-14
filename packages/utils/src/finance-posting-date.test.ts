import { expect, test } from "bun:test"
import { financePostingDayStart } from "./finance-posting-date"
test("first-day date inputs preserve the exact bookkeeping start; other days remain unchanged", () => {
  const start = "2026-10-13T18:00:00.000Z"
  expect(financePostingDayStart("2026-10-13", start).toISOString()).toBe(start)
  expect(financePostingDayStart("2026-10-14", start).toISOString()).toBe(
    "2026-10-14T00:00:00.000Z",
  )
  // A pre-book day remains earlier so canonical validation refuses it.
  expect(financePostingDayStart("2026-10-12", start).getTime()).toBeLessThan(
    new Date(start).getTime(),
  )
})
