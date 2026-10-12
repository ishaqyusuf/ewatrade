import { expect, test } from "bun:test"
import {
  cashCountAction,
  generalCashCountLookupInput,
  generalDayCloseInput,
} from "./cash-count"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
const draft = {
  action: "cash_count_record",
  bookId: "book",
  accountId: "cash",
  asOf: "2026-10-10T23:59:59.999Z",
  observedBalanceMinor: "0",
  reference: "Till count",
  cashPhysicallyCounted: true,
}
test("cash observation is strict, exact and allows zero", () => {
  expect(generalActionSchema.safeParse(draft).success).toBe(true)
  expect(cashCountAction.parse(draft).observedBalanceMinor).toBe("0")
  expect(
    cashCountAction.parse({
      ...draft,
      observedBalanceMinor: "9223372036854775807",
    }).observedBalanceMinor,
  ).toBe("9223372036854775807")
  for (const observedBalanceMinor of [
    "-1",
    "01",
    "1.2",
    "9223372036854775808",
    "",
    " 0",
    "1e2",
  ])
    expect(
      cashCountAction.safeParse({ ...draft, observedBalanceMinor }).success,
    ).toBe(false)
  for (const extra of [
    { tenantId: "foreign" },
    { actorUserId: "other" },
    { adjust: true },
    { closeDay: true },
  ])
    expect(cashCountAction.safeParse({ ...draft, ...extra }).success).toBe(
      false,
    )
  expect(
    cashCountAction.safeParse({ ...draft, cashPhysicallyCounted: false })
      .success,
  ).toBe(false)
  expect(cashCountAction.safeParse({ ...draft, reference: " " }).success).toBe(
    false,
  )
})
test("cash-count receipt requires the exact Finance Book for original recovery", () => {
  const receipt = {
    kind: "finance_cash_count",
    recordId: "original-count",
    title: "Cash count recorded",
    detail: "Original observation preserved",
  }
  expect(generalReceiptSchema.safeParse(receipt).success).toBe(false)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, bookId: "original-book" })
      .success,
  ).toBe(true)
})
test("day-close input preserves exact canonical UTC cutoff and Book scope", () => {
  expect(
    generalDayCloseInput.parse({ bookId: "book", through: draft.asOf }).through,
  ).toBe(draft.asOf)
  for (const through of [
    "2026-10-10T23:59:59Z",
    "2026-10-10T00:00:00Z",
    "not-date",
  ])
    expect(
      generalDayCloseInput.safeParse({ bookId: "book", through }).success,
    ).toBe(false)
  expect(
    generalCashCountLookupInput.safeParse({
      bookId: "book",
      search: "Front till",
    }).success,
  ).toBe(true)
  expect(
    generalCashCountLookupInput.safeParse({ search: "Front till" }).success,
  ).toBe(false)
})
