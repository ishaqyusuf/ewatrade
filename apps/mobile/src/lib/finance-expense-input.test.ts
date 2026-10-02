import { describe, expect, test } from "bun:test"
import {
  financeUtcDate,
  prepareExpenseCorrection,
  prepareExpensePayment,
} from "./finance-expense-input"

const payment = {
  bookId: "book",
  billId: "bill",
  outstandingMinor: "1500",
  earliestDate: "2026-10-01T00:00:00.000Z",
  fundingAccountId: "bank",
  activeAccountIds: ["bank"],
  amount: "12.50",
  date: "2026-10-02",
  reference: "  Paid 42  ",
}
describe("native expense input safeguards", () => {
  test("partial business settlement preserves exact minor units, selected funding and UTC date", () => {
    const result = prepareExpensePayment(payment)
    expect(result).toEqual({
      bookId: "book",
      billId: "bill",
      amountMinor: "1250",
      effectiveAt: new Date("2026-10-02T00:00:00Z"),
      funding: "BUSINESS_ACCOUNT",
      accountId: "bank",
      reference: "Paid 42",
    })
  })
  test("owner funding is explicit and never includes a business account", () => {
    const result = prepareExpensePayment({
      ...payment,
      fundingAccountId: "OWNER_CAPITAL",
      reference: "",
    })
    expect(result.funding).toBe("OWNER_CAPITAL")
    expect(result).not.toHaveProperty("accountId")
    expect(result).not.toHaveProperty("reference")
  })
  test("overpayment and an archived or foreign funding choice fail before review", () => {
    expect(() =>
      prepareExpensePayment({ ...payment, amount: "15.01" }),
    ).toThrow("exceeds")
    expect(() =>
      prepareExpensePayment({
        ...payment,
        fundingAccountId: "other-book-account",
      }),
    ).toThrow("active business")
    expect(() =>
      prepareExpensePayment({ ...payment, activeAccountIds: [] }),
    ).toThrow("active business")
  })
  test("non-positive and inexact monetary inputs cannot become a payment", () => {
    for (const amount of ["0", "-1", "1.005", "1e2"])
      expect(() => prepareExpensePayment({ ...payment, amount })).toThrow()
  })
  test("calendar rollover, pre-source date and invalid format fail closed", () => {
    for (const date of ["2026-02-30", "2026-09-30", "02/10/2026"])
      expect(() => financeUtcDate(date, payment.earliestDate)).toThrow(
        "valid UTC date",
      )
    expect(
      financeUtcDate("2026-10-01", payment.earliestDate).toISOString(),
    ).toBe(payment.earliestDate)
  })
  test("correction binds the original payment or bill and requires a reason", () => {
    const correction = {
      bookId: "book",
      billId: "bill",
      earliestDate: payment.earliestDate,
      date: payment.date,
      reason: "  Wrong account  ",
    }
    const reverse = prepareExpenseCorrection({
      ...correction,
      paymentId: "original-payment",
    })
    expect(reverse.operation).toBe("reverseBillPayment")
    expect(reverse.payload).toHaveProperty("paymentId", "original-payment")
    expect(reverse.payload).not.toHaveProperty("billId")
    const cancel = prepareExpenseCorrection(correction)
    expect(cancel.operation).toBe("voidExpense")
    expect(cancel.payload).toHaveProperty("billId", "bill")
    expect(cancel.payload.reason).toBe("Wrong account")
    expect(() =>
      prepareExpenseCorrection({ ...correction, reason: "  " }),
    ).toThrow("reason")
    expect(() =>
      prepareExpenseCorrection({ ...correction, reason: "x".repeat(401) }),
    ).toThrow("reason")
  })
  test("cancellation review cannot predate the last payment reversal", () => {
    expect(() =>
      prepareExpenseCorrection({
        bookId: "book",
        billId: "bill",
        reason: "Cancel",
        date: "2026-10-01",
        earliestDate: "2026-10-02T00:00:00Z",
      }),
    ).toThrow("original record")
  })
})
