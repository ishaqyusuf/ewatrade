import { expect, test } from "bun:test"
import { prepareReviewedQuoteDecisionInTransaction } from "./commerce-quote-decision-review"
import {
  getCommerceQuoteApprovalReadOnlyInTransaction,
  rejectCommerceQuoteVersionInTransaction,
} from "./commerce-quotes"
import {
  decision,
  decisionScope,
  fixture,
} from "./test-helpers/commerce-quote-decision"

function input(
  row: ReturnType<typeof decision>,
  choice: "approve" | "reject" = "reject",
) {
  return {
    ...decisionScope,
    approvalId: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    decision: choice,
    reason: "Original stated reason",
  }
}

test("pure approval review binds exact saved version, commercial release and linked-effect set without screening or writes", async () => {
  const row = decision()
  const f = fixture([row])
  const first = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(first.target.id).toBe(row.id)
  expect(first.review.effects).toMatchObject({
    issueVersion: true,
    createPublicAcceptanceCapability: true,
    sourceIssuedFacts: true,
    decisionAudit: true,
    linkedConversationCount: 0,
    textScreening: "required_by_native_execution_not_checked",
    providerDelivery: "not_checked",
  })
  expect(f.writes).toEqual([])
  f.state.linkedConversations = [{ conversationId: "existing-chat" }]
  const second = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(second.target.revision).not.toBe(first.target.revision)
  expect(second.review.effects.linkedConversationCount).toBe(1)
  expect(f.writes).toEqual([])
})

test("prepared rejection preserves native eligibility when stock is unavailable; ordinary read behavior remains unchanged", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.product = true
  const ordinary = await getCommerceQuoteApprovalReadOnlyInTransaction(
    f.tx,
    input(row),
  )
  expect(ordinary.currentReview.stale).toBe(true)
  expect(ordinary.actions.canReject).toBe(false)
  const offeringReads = f.reads.filter(
    (read) => read.table === "offering",
  ).length
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  expect(prepared.review.detail.actions.canReject).toBe(true)
  expect(prepared.review.effects.issueVersion).toBe(false)
  expect(f.reads.filter((read) => read.table === "offering").length).toBe(
    offeringReads,
  )
  expect(f.writes).toEqual([])
})

test("already-quoted sources do not fabricate a fresh source transition in the approval review", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.sourceStatus = "QUOTED"
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(prepared.review.sourceState).toBe("QUOTED")
  expect(prepared.review.effects.sourceIssuedFacts).toBe(false)
  expect(prepared.review.effects.issueVersion).toBe(true)
  expect(f.writes).toEqual([])
})

test("maker-checker, active selected approver and current policy/version are required for both decisions", async () => {
  for (const choice of ["approve", "reject"] as const) {
    for (const alteration of [
      "maker",
      "revoked",
      "policy",
      "version",
      "expired",
    ] as const) {
      const row = decision()
      const f = fixture([row])
      if (alteration === "maker") row.requesterMembershipId = "checker"
      if (alteration === "revoked") f.state.assigned = false
      if (alteration === "policy") f.state.policyRevision += 1
      if (alteration === "version")
        row.quote.currentVersionId = "different-version"
      if (alteration === "expired")
        row.quoteVersion.expiresAt = new Date("2000-01-01T00:00:00Z")
      await expect(
        prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, choice)),
      ).rejects.toThrow()
      expect(f.writes).toEqual([])
      expect(row.status).toBe("PENDING")
    }
  }
})

test("foreign original identity, revoked scoped Store grant and prescription/pharmacy sources refuse without reconciliation", async () => {
  for (const alteration of [
    "approval",
    "quote",
    "tuple-version",
    "scope",
    "prescription",
    "pharmacy",
  ] as const) {
    const row = decision()
    const f = fixture([row])
    const request = input(row)
    if (alteration === "approval") request.approvalId = "foreign-approval"
    if (alteration === "quote") request.quoteId = "foreign-quote"
    if (alteration === "tuple-version")
      request.quoteVersionId = "foreign-version"
    if (alteration === "scope") {
      f.state.scoped = true
      f.state.storeGranted = false
    }
    if (alteration === "prescription") row.sourceType = "PRESCRIPTION_REQUEST"
    if (alteration === "pharmacy") row.sourceType = "COMMERCE_INQUIRY"
    await expect(
      prepareReviewedQuoteDecisionInTransaction(f.tx, request),
    ).rejects.toThrow()
    expect(f.writes).toEqual([])
    expect(row.status).toBe("PENDING")
  }
})

test("release preview refuses eleven linked conversations; rejection does not consult unrelated release links", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.linkedConversations = Array.from({ length: 11 }, (_, i) => ({
    conversationId: `chat-${i}`,
  }))
  await expect(
    prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
  ).rejects.toThrow("too many")
  const count = f.reads.filter((read) => read.table === "links").length
  const rejected = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  expect(rejected.review.effects.linkedConversationCount).toBe(0)
  expect(f.reads.filter((read) => read.table === "links").length).toBe(count)
  expect(f.writes).toEqual([])
})

test("caller-owned rejection writes the original stored decision once; exact native replay preserves its times and changed input refuses", async () => {
  const row = decision()
  const f = fixture([row], true)
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  const original = await prepared.execute("server-command")
  expect(original).toMatchObject({
    approvalId: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    decision: "rejected",
    releaseState: "rejected",
    decidedByMembershipId: "checker",
    reason: "Original stated reason",
  })
  if (!row.decidedAt)
    throw Error("Native rejection must record its original decision time.")
  expect(original.decidedAt).toBe(row.decidedAt.toISOString())
  expect("token" in original).toBe(false)
  expect(f.writes).toEqual(["approval.updateMany", "approval-audit.create"])
  const native = {
    ...input(row),
    clientDecisionId: "server-command",
    expectedPolicyRevision: 4,
  }
  await expect(
    rejectCommerceQuoteVersionInTransaction(f.tx, native),
  ).resolves.toMatchObject({ approvalId: row.id, releaseState: "rejected" })
  expect(f.writes).toHaveLength(2)
  await expect(
    rejectCommerceQuoteVersionInTransaction(f.tx, {
      ...native,
      reason: "Different reason",
    }),
  ).rejects.toThrow("different input")
  expect(row.decidedAt?.toISOString()).toBe(original.decidedAt)
  // GENERAL completed recovery must return the original receipt, not prepare/execute again.
  await expect(
    prepareReviewedQuoteDecisionInTransaction(f.tx, input(row)),
  ).rejects.toThrow()
})

test("changed native release facts after preparation yield refusal, never a completed superseded receipt", async () => {
  const row = decision()
  const f = fixture([row], true)
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  f.state.assigned = false
  await expect(prepared.execute("server-command")).rejects.toThrow(
    "must roll back",
  )
  expect(row.status).toBe("SUPERSEDED")
  // This is transaction-local fake state, not proof of a real rollback; root GENERAL must roll it back.
  expect(row.quoteVersion.status).toBe("SUPERSEDED")
  expect(f.writes).toEqual([
    "approval.updateMany",
    "version.updateMany",
    "approval-audit.create",
  ])
})

test("approval review retains current author Terms refusal without any write or provider screening", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.termsAccepted = false
  await expect(
    prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
  ).rejects.toThrow("Terms")
  expect(f.writes).toEqual([])
  expect(
    f.reads.filter((r) => r.table === "legalAcceptance").length,
  ).toBeGreaterThan(0)
  const rejected = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "reject"),
  )
  expect(rejected.review.decision).toBe("reject")
})

test("original read retains recorded decision time, membership and reason without tokens or current-actor substitution", async () => {
  const row = decision()
  const f = fixture([row], true)
  await rejectCommerceQuoteVersionInTransaction(f.tx, {
    ...input(row),
    expectedPolicyRevision: 4,
    clientDecisionId: "recorded-decision",
  })
  const writes = [...f.writes]
  const original = await getCommerceQuoteApprovalReadOnlyInTransaction(
    f.tx,
    input(row),
  )
  expect(original.decidedAt).toEqual(row.decidedAt)
  expect(original.decidedByMembershipId).toBe(row.decidedByMembershipId)
  expect(original.decidedByMembershipId).not.toBe(
    original.createdByMembershipId,
  )
  expect(original.reason).toBe("Original stated reason")
  expect(original.status).toBe("rejected")
  for (const field of [
    "decisionClientId",
    "decisionPayloadHash",
    "acceptanceTokenDigest",
    "token",
  ])
    expect(original).not.toHaveProperty(field)
  expect(f.writes).toEqual(writes)
})
