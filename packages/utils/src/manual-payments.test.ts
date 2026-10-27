import { expect, test } from "bun:test"
import {
  manualBankDetails,
  manualPaymentAmount,
  manualPaymentOutcome,
} from "./manual-payments"

test("customer report amount honors fixed/partial policy and current remaining balance", () => {
  expect(
    manualPaymentAmount({
      amountMinor: 5000,
      requestedMinor: 10000,
      balanceMinor: 10000,
      allowPartial: true,
    }),
  ).toBe(10000)
  expect(
    manualPaymentAmount({
      amountMinor: 6000,
      requestedMinor: 10000,
      balanceMinor: 6000,
      allowPartial: false,
    }),
  ).toBe(6000)
  for (const amountMinor of [0, -1, 0.5, 10001, Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      manualPaymentAmount({
        amountMinor,
        requestedMinor: 10000,
        balanceMinor: 10000,
        allowPartial: true,
      }),
    ).toThrow()
  expect(() =>
    manualPaymentAmount({
      amountMinor: 5000,
      requestedMinor: 10000,
      balanceMinor: 10000,
      allowPartial: false,
    }),
  ).toThrow("displayed payment amount")
  expect(() =>
    manualPaymentAmount({
      amountMinor: 1,
      requestedMinor: 10000,
      balanceMinor: 0,
      allowPartial: true,
    }),
  ).toThrow("no amount")
})
test("manual bank instructions preserve leading account zero and require complete identity", () => {
  expect(
    manualBankDetails({
      bankName: " GTBank ",
      accountNumber: " 0123456789 ",
      accountHolder: " Ishaq Yusuf ",
    }),
  ).toEqual({
    bankName: "GTBank",
    bankAccountNumber: "0123456789",
    bankAccountHolder: "Ishaq Yusuf",
  })
  for (const accountNumber of ["12345", "012345678x", "12345678901"])
    expect(() =>
      manualBankDetails({
        bankName: "GTBank",
        accountNumber,
        accountHolder: "Ishaq",
      }),
    ).toThrow()
})
test("only merchant confirmation produces paid/partial states; a claim never claims bank verification", () => {
  const input = {
    receivedAmountMinor: null,
    balanceMinor: 10000,
    currencyCode: "NGN",
    orderNumber: "ABC",
    note: null,
  }
  expect(manualPaymentOutcome({ ...input, status: "SUBMITTED" })).toEqual({
    state: "checking",
    message: "Your payment is being confirmed.",
  })
  expect(
    manualPaymentOutcome({
      ...input,
      status: "CONFIRMED",
      receivedAmountMinor: 5000,
      balanceMinor: 5000,
    }).state,
  ).toBe("partially_paid")
  expect(
    manualPaymentOutcome({
      ...input,
      status: "CONFIRMED",
      receivedAmountMinor: 10000,
      balanceMinor: 0,
    }).state,
  ).toBe("paid")
  expect(
    manualPaymentOutcome({
      ...input,
      status: "NOT_RECEIVED",
      note: "Please check the destination.",
    }),
  ).toMatchObject({ state: "not_received" })
})
