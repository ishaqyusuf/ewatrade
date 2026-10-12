import { expect, test } from "bun:test"
import { generalActionSchema, generalActionSummary } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = {
  action: "purchase_recognition_reverse" as const,
  bookId: "book",
  recognitionId: "purchase",
  eventId: "invoice-event",
  effectiveAt: "2026-10-10T12:00:00.123Z",
  reason: "Duplicate invoice fact",
  bookkeepingOnly: true as const,
}
test("purchase fact correction binds original event without caller replacement facts or money", () => {
  expect(generalActionSchema.parse(payload)).toEqual(payload)
  for (const change of [
    { bookId: " " },
    { recognitionId: " " },
    { eventId: " " },
    { reason: " " },
    { effectiveAt: "yesterday" },
    { bookkeepingOnly: false },
    { bookkeepingOnly: undefined },
    { stage: "RECEIPT" },
    { amountMinor: "1" },
    { invoiceAmountMinor: "1" },
    { moneyAccountId: "other" },
    { debitAccountId: "other" },
    { lines: [] },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "caller" },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(generalActionSummary(payload, "NGN")).toContain(payload.reason)
  expect(capabilityForAction(payload.action)).toMatchObject({
    id: "finance.purchase.fact.reverse",
    rollout: "planned",
    scope: "book",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.reversePurchaseRecognition"],
    receipt: "finance_purchase_registration",
  })
})
