import { expect, test } from "bun:test"
import type { GeneralCashCountAction } from "@ewatrade/assistant/general/contracts"
import {
  nativeCashCountCandidate,
  nativeCashCountValues,
  parseNativeObservedCash,
} from "./native-cash-count-values"

const initial: GeneralCashCountAction = {
  action: "cash_count_record",
  bookId: "original-book",
  accountId: "original-cash",
  observedBalanceMinor: "1234567890123456789",
  asOf: "2026-10-15T13:00:00.123456Z",
  reference: "Counted till",
  cashPhysicallyCounted: true,
}
const current = {
  bookId: "original-book",
  account: {
    id: "original-cash",
    bookId: "original-book",
    purpose: "CASH",
    archivedAt: null,
  },
}

test("native cash initializer uses original physical amount exactly and always resets acknowledgement", () => {
  expect(nativeCashCountValues(initial)).toEqual({
    amount: "12345678901234567.89",
    date: initial.asOf,
    reference: initial.reference,
    acknowledged: false,
  })
  expect(
    nativeCashCountValues({ ...initial, observedBalanceMinor: "0" }).amount,
  ).toBe("0.00")
  expect(nativeCashCountValues(initial).acknowledged).toBe(false)
})
test("cash parsing never uses floating point and accepts zero through exact Int64 maximum", () => {
  expect(parseNativeObservedCash("92233720368547758.07")).toBe(
    "9223372036854775807",
  )
  expect(parseNativeObservedCash("12345678901234567.89")).toBe(
    "1234567890123456789",
  )
  expect(parseNativeObservedCash("0")).toBe("0")
  expect(parseNativeObservedCash("0.01")).toBe("1")
  for (const value of [
    "92233720368547758.08",
    "92233720368547759",
    "1.001",
    "-1",
    "1e3",
    "1,00",
    "00",
    "NaN",
    "Infinity",
    "",
  ])
    expect(() => parseNativeObservedCash(value)).toThrow()
})
test("fresh physical acknowledgement is required and the original exact UTC fraction survives", () => {
  const values = nativeCashCountValues(initial)
  expect(nativeCashCountCandidate(initial, values, current).ok).toBe(false)
  expect(
    nativeCashCountCandidate(
      initial,
      { ...values, acknowledged: true },
      current,
    ),
  ).toEqual({ ok: true, payload: initial })
  const zero = nativeCashCountCandidate(
    initial,
    {
      ...values,
      acknowledged: true,
      amount: "0",
      reference: "Zero till count",
    },
    current,
  )
  expect(zero.ok && zero.payload.observedBalanceMinor).toBe("0")
  expect(zero.ok && zero.payload.reference).toBe("Zero till count")
})
test("explicit UTC date changes preserve every fraction and refuse local, offset, invalid calendar or time", () => {
  const values = {
    ...nativeCashCountValues(initial),
    acknowledged: true,
    date: "2026-10-16T09:23:45.987654321Z",
  }
  const result = nativeCashCountCandidate(initial, values, current)
  expect(result.ok && result.payload.asOf).toBe(values.date)
  for (const date of [
    "2026-10-16T09:23",
    "2026-10-16T09:23:45+01:00",
    "2026-02-30T09:23:45Z",
    "2026-10-16T24:00:00Z",
    "invalid",
    "",
  ])
    expect(
      nativeCashCountCandidate(initial, { ...values, date }, current).ok,
    ).toBe(false)
})
test("current Book, exact active cash identity and purpose must match without switching the saved target", () => {
  const values = { ...nativeCashCountValues(initial), acknowledged: true }
  for (const source of [
    { ...current, bookId: "foreign" },
    { ...current, account: { ...current.account, id: "other" } },
    { ...current, account: { ...current.account, bookId: "foreign" } },
    { ...current, account: { ...current.account, purpose: "BANK" } },
    {
      ...current,
      account: { ...current.account, archivedAt: "2026-10-15T00:00:00Z" },
    },
  ])
    expect(nativeCashCountCandidate(initial, values, source).ok).toBe(false)
  const result = nativeCashCountCandidate(
    initial,
    { ...values, amount: "12.34" },
    current,
  )
  expect(result.ok && result.payload.accountId).toBe("original-cash")
  expect(result.ok && result.payload.bookId).toBe("original-book")
})
test("reference bounds and strict schema forbid untrusted close/variance/actor fields", () => {
  const values = { ...nativeCashCountValues(initial), acknowledged: true }
  expect(
    nativeCashCountCandidate(initial, { ...values, reference: " " }, current),
  ).toEqual({ ok: false, error: "Enter a reference for this cash count." })
  expect(
    nativeCashCountCandidate(
      initial,
      { ...values, reference: "x".repeat(201) },
      current,
    ),
  ).toEqual({
    ok: false,
    error: "Keep the count reference within 200 characters.",
  })
  expect(
    nativeCashCountCandidate(
      initial,
      { ...values, reference: "x".repeat(200) },
      current,
    ).ok,
  ).toBe(true)
  const injected = {
    ...initial,
    actorUserId: "foreign",
    closeDay: true,
    differenceMinor: "0",
  }
  expect(nativeCashCountCandidate(injected, values, current)).toEqual({
    ok: false,
    error:
      "This saved cash-count draft is invalid. Reopen it from the assistant.",
  })
})
