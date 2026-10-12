import { expect, test } from "bun:test"
import type { z } from "zod"
import {
  quoteDecisionAction,
  quoteDecisionReceipt,
  type QuoteDecisionAction,
} from "./quote-decision"

const original = {
  approvalId: "original-approval",
  quoteId: "original-quote",
  quoteVersionId: "original-version",
  reason: "The stated commercial decision",
}
test("decision intentions retain exact original tuple and refuse model authority or replay identities", () => {
  for (const action of [
    "commerce_quote_approve",
    "commerce_quote_reject",
  ] satisfies readonly QuoteDecisionAction["action"][]) {
    expect(quoteDecisionAction.parse({ ...original, action })).toEqual({
      ...original,
      action,
    })
    for (const field of [
      "actorUserId",
      "storeId",
      "tenantId",
      "expectedPolicyRevision",
      "clientDecisionId",
      "protectActionId",
      "decision",
      "token",
    ])
      expect(
        quoteDecisionAction.safeParse({
          ...original,
          action,
          [field]: "forged",
        }).success,
      ).toBe(false)
    for (const field of ["approvalId", "quoteId", "quoteVersionId", "reason"])
      expect(
        quoteDecisionAction.safeParse({ ...original, action, [field]: " " })
          .success,
      ).toBe(false)
  }
})

test("receipt preserves original stored decision/time and cannot carry public bearer credentials or mismatched release", () => {
  const receipt = {
    kind: "commerce_quote_decision",
    recordId: original.approvalId,
    quoteId: original.quoteId,
    quoteVersionId: original.quoteVersionId,
    decision: "approved",
    releaseState: "released",
    policyRevision: 4,
    decidedAt: "2026-10-12T10:00:00.000Z",
    decidedByMembershipId: "original-checker",
    reason: original.reason,
    title: "Quotation approved and released",
    detail: "Exact commercial release, not payment.",
  } satisfies z.infer<typeof quoteDecisionReceipt>
  expect(quoteDecisionReceipt.parse(receipt)).toEqual(receipt)
  for (const field of [
    "token",
    "acceptanceTokenDigest",
    "communicationIntentId",
    "credentials",
    "clientDecisionId",
  ])
    expect(
      quoteDecisionReceipt.safeParse({ ...receipt, [field]: "secret" }).success,
    ).toBe(false)
  expect(
    quoteDecisionReceipt.safeParse({ ...receipt, releaseState: "rejected" })
      .success,
  ).toBe(false)
  expect(
    quoteDecisionReceipt.safeParse({
      ...receipt,
      decision: "rejected",
      releaseState: "rejected",
    }).success,
  ).toBe(true)
})
