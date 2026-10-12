import { createHash } from "node:crypto"
import { expect, test } from "bun:test"
import {
  approveCommerceQuoteVersionInTransaction,
  rejectCommerceQuoteVersion,
  rejectCommerceQuoteVersionInTransaction,
} from "./commerce-quotes"
import {
  decision,
  decisionScope,
  fixture,
} from "./test-helpers/commerce-quote-decision"

test("native caller-owned approved replay keeps exact decision binding and token rotation; changed payload or revoked approver refuses", async () => {
  const row = decision()
  row.status = "APPROVED"
  row.quoteVersion.status = "ISSUED"
  row.decidedByMembershipId = "checker"
  row.decidedAt = new Date("2026-01-02T00:00:00Z")
  row.decisionClientId = "saved-native-command"
  row.reason = "Original decision"
  const input = {
    ...decisionScope,
    approvalId: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    expectedPolicyRevision: 4,
    clientDecisionId: row.decisionClientId,
    reason: row.reason,
  }
  const persistedPayload = {
    approvalId: input.approvalId,
    expectedPolicyRevision: input.expectedPolicyRevision,
    quoteId: input.quoteId,
    quoteVersionId: input.quoteVersionId,
    reason: input.reason,
    storeId: input.storeId,
  }
  row.decisionPayloadHash = createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(persistedPayload).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        ),
      ),
    )
    .digest("hex")
  const f = fixture([row], true)
  const result = await approveCommerceQuoteVersionInTransaction(f.tx, input)
  expect(result).toMatchObject({
    approvalId: row.id,
    versionId: row.quoteVersionId,
    releaseState: "released",
  })
  expect("token" in result && typeof result.token === "string").toBe(true)
  expect(f.writes).toEqual(["replay-token.upsert"])
  await expect(
    approveCommerceQuoteVersionInTransaction(f.tx, {
      ...input,
      reason: "Changed decision",
    }),
  ).rejects.toThrow("different input")
  f.state.assigned = false
  await expect(
    approveCommerceQuoteVersionInTransaction(f.tx, input),
  ).rejects.toThrow("different input")
  expect(f.writes).toHaveLength(1)
  expect(row.decidedAt?.toISOString()).toBe("2026-01-02T00:00:00.000Z")
})

test("caller-owned stale decision returns a tag; ordinary root command retains commit-then-refusal reconciliation", async () => {
  const first = decision()
  first.quote.currentVersionId = "new-version"
  const f = fixture([first], true)
  const original = {
    ...decisionScope,
    approvalId: first.id,
    quoteId: first.quoteId,
    quoteVersionId: first.quoteVersionId,
    expectedPolicyRevision: 4,
    clientDecisionId: "native-key",
    reason: "Original decision",
  }
  await expect(
    rejectCommerceQuoteVersionInTransaction(f.tx, original),
  ).resolves.toEqual({ superseded: true })
  expect(first.status).toBe("SUPERSEDED")
  const second = decision()
  second.quote.currentVersionId = "new-version"
  const root = fixture([second], true)
  await expect(rejectCommerceQuoteVersion(root.root, original)).rejects.toThrow(
    "superseded",
  )
  expect(second.status).toBe("SUPERSEDED")
  expect(root.writes).toEqual([
    "approval.updateMany",
    "version.updateMany",
    "approval-audit.create",
  ])
  // Fake delegate state checks preserve wrapper sequencing, not a real DB commit/rollback acceptance claim.
})
