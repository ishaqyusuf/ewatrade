import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { getCustomerLedgerCreditRefundReview } from "@ewatrade/db/queries"
import type { GeneralTransactionContext } from "./general-actions"
import { heldCreditRefund, heldCreditRefundReviewLines } from "./general-held-credit-refund"
import { generalCapabilityEnabled } from "./general-rollout"
const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => { process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "t".repeat(32) })
afterAll(() => {
  if (savedKey === undefined) Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})
const payload: Extract<GeneralAction, { action: "held_credit_refund" }> = {
  action: "held_credit_refund", bookId: "book", accountId: "account", creditEntryId: "credit",
  moneyAccountId: "cash", amountMinor: "250", method: "CASH", effectiveAt: "2026-09-02T12:00:00Z",
  reason: "Customer collected unused deposit", moneyAlreadyReturned: true,
}
function context(role: string, plan = "pro") {
  return { session: { user: { id: "actor" } }, tenantContext: {
    tenant: { id: "tenant", dataClassification: "QA", retailOpsPlanId: plan }, membership: { role },
    activeStore: { id: "store" }, stores: [{ id: "store" }], staffAccess: { status: "ACTIVE", mode: "LEGACY" },
  }, db: {} } as unknown as GeneralTransactionContext
}
test("held-credit refund remains unavailable before acceptance", () => {
  expect(generalCapabilityEnabled(capabilityForAction("held_credit_refund"))).toBe(false)
})
test("adapter enforces finance role and plan before reading customer funds", async () => {
  await expect(heldCreditRefund.validate(context("MANAGER"), payload)).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(heldCreditRefund.validate(context("OWNER", "free"), payload)).rejects.toThrow()
})
test("review states named customer, exact remainder and completed-payout boundary", () => {
  const review: Awaited<ReturnType<typeof getCustomerLedgerCreditRefundReview>> = {
    bookId: "book", accountId: "account", customerId: "customer", customerName: "QA customer",
    currencyCode: "NGN", accountRevision: "9", creditEntryId: "credit", creditKind: "RECEIPT",
    amountMinor: "250", availableBeforeMinor: "700", availableAfterMinor: "450",
    moneyAccountId: "cash", moneyAccountName: "Till", method: "CASH", effectiveAt: payload.effectiveAt,
    effect: "RECORD_MONEY_ALREADY_RETURNED", providerRefund: "NOT_REQUESTED", orderCancellation: "NOT_PERFORMED",
  }
  const lines = heldCreditRefundReviewLines(review, { ...payload, reference: "QA receipt" }).join("\n")
  expect(lines).toContain("already returned to QA customer")
  expect(lines).toContain("Unused held credit:")
  expect(lines).toContain("Payout account: Till")
  expect(lines).toContain("does not send money")
  expect(lines).toContain("Reference: QA receipt")
})
