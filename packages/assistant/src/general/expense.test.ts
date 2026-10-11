import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = {
  action: "expense_record",
  bookId: "book",
  payeeName: "Landlord",
  description: "October rent",
  incurredAt: "2026-10-01T12:00:00Z",
  expenseAlreadyIncurred: true,
  lines: [{ accountId: "rent", description: "October", amountMinor: "1000" }],
}
const payment = {
  funding: "BUSINESS_ACCOUNT",
  accountId: "cash",
  amountMinor: "250",
  effectiveAt: "2026-10-01T12:00:00.123Z",
  paymentAlreadyMade: true,
}
test("expense supports unpaid, partial business and owner-funded recording with explicit acknowledgment", () => {
  expect(generalActionSchema.safeParse(payload).success).toBe(true)
  expect(generalActionSchema.safeParse({ ...payload, payment }).success).toBe(
    true,
  )
  expect(
    generalActionSchema.safeParse({
      ...payload,
      payment: { funding: "OWNER_CAPITAL", amountMinor: payment.amountMinor, effectiveAt: payment.effectiveAt, paymentAlreadyMade: true },
    }).success,
  ).toBe(true)
  for (const change of [
    { expenseAlreadyIncurred: false },
    { tenantId: "other" },
    { storeId: "other" },
    { clientCommandId: "key" },
    { lines: [] },
    { dueAt: "2026-09-30T12:00:00Z" },
    { payment: { ...payment, paymentAlreadyMade: false } },
    { payment: { ...payment, amountMinor: "1001" } },
    { payment: { ...payment, funding: "OWNER_CAPITAL" } },
    { payment: { ...payment, accountId: undefined } },
    { payment: { ...payment, effectiveAt: "2026-09-30T12:00:00Z" } },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(
    generalActionSchema.safeParse({
      ...payload,
      lines: [
        { ...payload.lines[0], amountMinor: "100000000000000" },
        { ...payload.lines[0], amountMinor: "1" },
      ],
    }).success,
  ).toBe(false)
})
test("expense receipt requires Book; capability stays planned dashboard finance", () => {
  const receipt = {
    kind: "finance_bill",
    recordId: "bill",
    title: "Recorded",
    detail: "Payable",
  }
  expect(generalReceiptSchema.safeParse(receipt).success).toBe(false)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, bookId: "book" }).success,
  ).toBe(true)
  expect(capabilityForAction("expense_record")).toMatchObject({
    rollout: "planned",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.recordExpense"],
  })
})
