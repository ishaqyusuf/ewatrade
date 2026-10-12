import { expect, test } from "bun:test"
import {
  cashCountEditorPayload,
  parseObservedCash,
} from "./cash-count-editor-values"
const initial = {
  action: "cash_count_record" as const,
  bookId: "original-book",
  accountId: "original-cash",
  asOf: "2026-10-10T23:59:59.999Z",
  observedBalanceMinor: "1",
  reference: "Count",
  cashPhysicallyCounted: true as const,
}
test("physical count parser accepts exact zero and bigint boundaries", () => {
  expect(parseObservedCash("0.00")).toBe("0")
  expect(parseObservedCash("92233720368547758.07")).toBe("9223372036854775807")
  for (const value of ["", "-0", "01", "1.001", "92233720368547758.08", "1e3"])
    expect(() => parseObservedCash(value)).toThrow()
})
test("editor requires physical acknowledgement and preserves reviewed millisecond cutoff", () => {
  const values = {
    amount: "0",
    date: "2026-10-10T23:59:59",
    reference: " Revised count ",
    acknowledged: true,
  }
  const result = cashCountEditorPayload(initial, values)
  expect(result.asOf).toBe(initial.asOf)
  expect(result.accountId).toBe(initial.accountId)
  expect(result.bookId).toBe(initial.bookId)
  expect(result.observedBalanceMinor).toBe("0")
  expect(result.reference).toBe("Revised count")
  expect(() =>
    cashCountEditorPayload(initial, { ...values, acknowledged: false }),
  ).toThrow("physically counted")
  expect(() =>
    cashCountEditorPayload(initial, { ...values, date: "bad-date" }),
  ).toThrow("valid count")
  expect(
    cashCountEditorPayload(initial, { ...values, date: "2026-10-10T23:58:59" })
      .asOf,
  ).toBe("2026-10-10T23:58:59.000Z")
})
