import { expect, test } from "bun:test"
import { generalActionSchema, generalActionSummary } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = {
  action: "purchase_payment_reverse" as const,
  bookId: "book",
  paymentId: "payment",
  effectiveAt: "2026-10-10T12:00:00.123Z",
  reason: "Duplicate payment record",
  bookkeepingOnly: true as const,
}
test("purchase payment reversal binds the whole original payment without caller amounts, accounts or authority", () => {
  expect(generalActionSchema.parse(payload)).toEqual(payload)
  for (const change of [
    { bookId: " " },
    { paymentId: " " },
    { reason: " " },
    { effectiveAt: "yesterday" },
    { bookkeepingOnly: false },
    { bookkeepingOnly: undefined },
    { amountMinor: "1" },
    { moneyAccountId: "other" },
    { billId: "other" },
    { supplierId: "other" },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "caller" },
    { paymentAlreadyMade: true },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(generalActionSummary(payload, "NGN")).toContain(payload.reason)
  expect(capabilityForAction(payload.action)).toMatchObject({
    id: "finance.purchase.payment.reverse",
    rollout: "planned",
    scope: "book",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.reversePurchasePayment"],
    receipt: "finance_purchase_bill",
  })
})
