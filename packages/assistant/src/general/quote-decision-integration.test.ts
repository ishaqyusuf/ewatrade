import { expect, test } from "bun:test"
import {
  generalActionSchema,
  generalActionSummary,
  generalReceiptSchema,
} from "./contracts"
import type { z } from "zod"
import {
  quoteDecisionReceipt,
  quoteDecisionReceiptTarget,
} from "./quote-decision"

const original = {
  approvalId: "original-approval",
  quoteId: "original-quote",
  quoteVersionId: "original-version",
  reason: "Stated reason",
}
const saved = {
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
  detail: "Original commercial release.",
} satisfies z.infer<typeof quoteDecisionReceipt>

test("central GENERAL unions retain decision effects and strict original receipt alongside existing receipts", () => {
  for (const action of [
    "commerce_quote_approve",
    "commerce_quote_reject",
  ] as const) {
    const parsed = generalActionSchema.parse({ ...original, action })
    expect(generalActionSummary(parsed, "NGN")).toContain(
      action === "commerce_quote_approve"
        ? "commercially release"
        : "keep version private",
    )
    expect(
      generalActionSchema.safeParse({
        ...original,
        action,
        expectedPolicyRevision: 4,
      }).success,
    ).toBe(false)
  }
  expect(generalReceiptSchema.parse(saved)).toEqual(saved)
  expect(
    generalReceiptSchema.safeParse({ ...saved, token: "bearer" }).success,
  ).toBe(false)
  expect(
    generalReceiptSchema.parse({
      kind: "customer",
      recordId: "existing-customer",
      title: "Customer added",
      detail: "Existing receipt",
    }),
  ).toEqual({
    kind: "customer",
    recordId: "existing-customer",
    title: "Customer added",
    detail: "Existing receipt",
  })
})

test("original decision opener refuses legacy partial or secret-bearing receipt and preserves all three saved IDs", () => {
  expect(quoteDecisionReceiptTarget(saved)).toEqual({
    kind: "commerce_quote_approval",
    approvalId: original.approvalId,
    quoteId: original.quoteId,
    quoteVersionId: original.quoteVersionId,
  })
  for (const key of [
    "recordId",
    "quoteId",
    "quoteVersionId",
    "decidedAt",
    "decidedByMembershipId",
  ] satisfies readonly (keyof typeof saved)[]) {
    const { [key]: omitted, ...partial } = saved
    expect(omitted).toBeDefined()
    expect(quoteDecisionReceiptTarget(partial)).toBeNull()
  }
  expect(
    quoteDecisionReceiptTarget({ ...saved, acceptanceTokenDigest: "secret" }),
  ).toBeNull()
})
