import { expect, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  approvalSummary,
  approvalWhen,
  receiptSlip,
} from "./receipt-approval-model"

const now = new Date(2026, 10, 15, 13, 45)

test("dates read as today, yesterday or a short day, never ISO", () => {
  expect(approvalWhen(new Date(2026, 10, 15, 13, 3), now)).toBe(
    "Today, 1:03 pm",
  )
  expect(approvalWhen(new Date(2026, 10, 14, 18, 1), now)).toBe(
    "Yesterday, 6:01 pm",
  )
  expect(approvalWhen(new Date(2026, 10, 2, 9, 5), now)).toBe("2 Nov, 9:05 am")
  expect(approvalWhen(new Date(2025, 11, 30, 9, 5), now)).toBe(
    "30 Dec 2025, 9:05 am",
  )
  expect(approvalWhen("not a date", now)).toBe("")
})

test("a transfer shows its amount, accounts, date and note", () => {
  const action = {
    action: "money_transfer_simple",
    amountMinor: 18_000_000,
    fromAccountName: "Bisi Opay",
    toAccountName: "Main bank",
    note: "today sales",
    effectiveAt: new Date(2026, 10, 14, 18, 1).toISOString(),
    attachmentIds: [],
  } as GeneralAction
  expect(approvalSummary(action, "NGN", now)).toEqual({
    amount: "₦180,000",
    from: "Bisi Opay",
    to: "Main bank",
    rows: [
      { label: "Date", value: "Yesterday, 6:01 pm" },
      { label: "Note", value: "today sales" },
    ],
  })
})

test("a payment says what it is for in one line", () => {
  const action = {
    action: "payment_record",
    orderId: "order-1",
    amountMinor: 250_050,
    method: "bank_transfer",
  } as GeneralAction
  expect(approvalSummary(action, "NGN", now)).toEqual({
    amount: "₦2,500.50",
    line: "Bank transfer payment for an order",
    rows: [],
  })
})

test("the receipt slip keeps printed names and splits bank details", () => {
  expect(
    receiptSlip([
      { label: "From", value: "BISI OJO · OPay · 810****051" },
      { label: "To", value: "HERITAGE WASH & CARE · GTBank · 0123454417" },
      { label: "Amount on receipt", value: "180,000.00" },
      { label: "Date", value: "14 Nov 2026, 6:01 PM" },
      { label: "Reference", value: "OPAY1794672482144" },
    ]),
  ).toEqual({
    amount: "180,000.00",
    rows: [
      { label: "From", value: "BISI OJO", detail: "OPay · 810****051" },
      {
        label: "To",
        value: "HERITAGE WASH & CARE",
        detail: "GTBank · 0123454417",
      },
      { label: "Date", value: "14 Nov 2026, 6:01 PM" },
      { label: "Reference", value: "OPAY1794672482144" },
    ],
    caption: "OPay · OPAY1794672482144",
  })
})
