import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = { action: "held_credit_refund", bookId: "book", accountId: "account", creditEntryId: "credit", moneyAccountId: "cash", amountMinor: "250", method: "CASH", effectiveAt: "2026-09-02T12:00:00Z", reason: "Customer collected unused funds", moneyAlreadyReturned: true }
test("held refund requires exact money and explicit completed-payout acknowledgment", () => {
  expect<unknown>(generalActionSchema.parse(payload)).toEqual(payload)
  for (const amountMinor of ["0", "01", "-1", "1.5", "1e3", "100000000000001"]) expect(generalActionSchema.safeParse({ ...payload, amountMinor }).success).toBe(false)
  expect(generalActionSchema.safeParse({ ...payload, amountMinor: "100000000000000" }).success).toBe(true)
  for (const moneyAlreadyReturned of [false, undefined, "true"]) expect(generalActionSchema.safeParse({ ...payload, moneyAlreadyReturned }).success).toBe(false)
})
test("held refund rejects authority, revision, command and provider overrides", () => {
  for (const key of ["tenantId", "actorUserId", "storeId", "expectedRevision", "clientCommandId", "providerRefundId", "customerId"]) expect(generalActionSchema.safeParse({ ...payload, [key]: "injected" }).success).toBe(false)
  expect(generalActionSchema.safeParse({ ...payload, method: "CUSTOMER_CREDIT" }).success).toBe(false)
  expect(generalActionSchema.safeParse({ ...payload, effectiveAt: "yesterday" }).success).toBe(false)
  const capability = capabilityForAction("held_credit_refund")
  expect(capability).toMatchObject({ rollout: "planned", effect: "book", scope: "book", clients: ["dashboard"], policy: { roles: ["OWNER", "ADMIN"] } })
})
