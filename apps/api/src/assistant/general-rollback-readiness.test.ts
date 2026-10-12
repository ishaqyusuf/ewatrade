import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  type GeneralContext,
  assertCapability,
  assertCapabilityAuthority,
} from "./general-context"
import {
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

// H05: rolling a capability back to `planned` withdraws new effects only.
const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "r".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})
function context(role: string) {
  return {
    session: { user: { id: "actor" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
        currencyCode: "NGN",
      },
      membership: { id: "membership", role },
      activeStore: { id: "store", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: role,
        status: "ACTIVE",
        mode: "LEGACY",
        catalogEditor: false,
        assignments: [],
      },
    },
    db: {},
  } as unknown as GeneralContext
}
const shipped = capabilityForAction("product_price_update")
const rolledBack = { ...shipped, rollout: "planned" as const }

test("rollback refuses new effects but keeps current authority checks", () => {
  expect(() => assertCapability(context("OWNER"), shipped)).not.toThrow()
  expect(() => assertCapability(context("OWNER"), rolledBack)).toThrow(
    "The assistant can't do this yet.",
  )
  // Saved receipts and draft cancellation use authority without rollout.
  expect(() =>
    assertCapabilityAuthority(context("OWNER"), rolledBack),
  ).not.toThrow()
  // Rollback never widens access: a role outside the policy is still refused.
  expect(() =>
    assertCapabilityAuthority(context("CASHIER"), rolledBack),
  ).toThrow("Sales reps can draft sales in the assistant.")
})

test("a pending draft of a rolled-back capability shows no approval and reads nothing", async () => {
  // held_credit_refund is planned in the manifest today.
  const payload: Extract<GeneralAction, { action: "held_credit_refund" }> = {
    action: "held_credit_refund",
    bookId: "book",
    accountId: "account",
    creditEntryId: "credit",
    moneyAccountId: "cash",
    amountMinor: "250",
    method: "CASH",
    effectiveAt: "2026-09-02T12:00:00Z",
    reason: "Customer collected unused deposit",
    moneyAlreadyReturned: true,
  }
  const row = {
    id: "proposal",
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "actor",
    conversationId: "conversation",
    revision: 1,
    action: "held_credit_refund",
    actionVersion: 1,
    payload,
    payloadHash: proposalDigest(payload),
    status: "PENDING" as const,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    executedResult: null,
    targetRevision: null,
    idempotencyKey: "key",
    approvalTokenHash: "",
  }
  row.approvalTokenHash = proposalDigest(
    proposalApprovalToken(row as never, "r".repeat(32)),
  )
  // Without the rollback the same row would carry a live approval.
  expect(generalProposalForApp(row as never).approvalToken).toBeString()
  const projected = await generalProposalWithReview(
    context("OWNER"),
    row as never,
  )
  expect(projected.status).toBe("PENDING")
  expect(projected.approvalToken).toBeUndefined()
  expect(projected.review).toEqual([
    "This action is paused in the assistant. Nothing has changed; cancel the draft or use the form.",
  ])
})
