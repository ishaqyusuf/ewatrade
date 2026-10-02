import { expect, test } from "bun:test"
import { selectReferencedReviewedCostPostings as select } from "./reviewed-cost-original-postings"
import { auditPriorCostReviewJournalProof as audit } from "./reviewed-cost-prior-journal-proof"
import { reviewedPurchaseFixture } from "./reviewed-cost-purchase-fixtures"
import { auditReviewedCostPurchaseSource } from "./reviewed-cost-purchase-rules"
import { financePayloadHash } from "./rules"

const scope = { tenantId: "tenant", bookId: "book" }

function fixture() {
  const source = reviewedPurchaseFixture()
  // The stored row order is deliberately unrelated to original writer order.
  source.journal?.lines.reverse()
  const proof = auditReviewedCostPurchaseSource(source)
  const { journal, postingCommand } = proof.snapshot
  if (!journal || !postingCommand) throw new Error("Missing original source")
  const at = new Date("2026-10-01T12:00:00Z")
  const prior: Parameters<typeof audit>[0]["prior"] = {
    reviews: [
      {
        id: "review",
        ...scope,
        clientCommandId: "pending-confirmation",
        payloadHash: "a".repeat(64),
        costTraceHash: "b".repeat(64),
        reviewedSnapshotHash: "c".repeat(64),
        algorithmVersion: "QA_PENDING",
        evidenceCutoff: at,
        historyThrough: at,
        reviewedBookSequence: 1n,
        reason: "QA only",
        sourceSnapshot: { qaOnly: true },
        postingPlan: [],
        actorUserId: "actor",
        createdAt: at,
        _count: { allocations: 0, poolSnapshots: 0, evidence: 0, journals: 1 },
      },
    ],
    allocations: [],
    poolSnapshots: [],
    evidence: [],
    journals: [
      {
        id: "link",
        ...scope,
        reviewId: "review",
        journalEntryId: journal.id,
        groupKey: "group",
        basis: { qaOnly: true },
      },
    ],
  }
  const facts: Parameters<typeof audit>[0]["facts"] = {
    entries: [
      {
        id: journal.id,
        bookId: journal.bookId,
        sequence: journal.sequence,
        sourceKind: journal.sourceKind,
        sourceId: journal.sourceId,
        payloadHash: journal.payloadHash,
        description: journal.description,
        storeId: journal.storeId,
        actorUserId: journal.actorUserId,
        effectiveAt: journal.effectiveAt,
        recordedAt: journal.effectiveAt,
        reversalOfId: null,
        reversal: null,
        _count: { lines: journal.lines.length },
      },
    ],
    lines: journal.lines.map(({ account, ...row }) => ({
      ...row,
      accountId: account.id,
    })),
    accounts: journal.lines.map(({ account }) => ({
      id: account.id,
      bookId: account.bookId,
    })),
    stores: [{ id: "store", tenantId: "tenant", currencyCode: "NGN" }],
    postingCommands: [
      {
        ...postingCommand,
        result: { entryId: journal.id, sequence: journal.sequence.toString() },
      },
    ],
  }
  return { source, proof, prior, facts }
}

test("audited purchase originals prove ordered posting facts without accepting prior confirmation", () => {
  const f = fixture()
  const originals = select(scope, f.prior, [f.proof.originalPosting])
  expect(originals[0]?.input.lines.map((line) => line.side)).toEqual([
    "DEBIT",
    "CREDIT",
  ])
  const result = audit({
    book: f.source.book,
    prior: f.prior,
    facts: f.facts,
    expectedPostings: originals,
  })
  expect(result.provedOriginalPostingEntryIds).toEqual(["journal"])
  expect(result.postedJournalFactsProved).toBe(true)
  expect(result.requiresClassificationProof).toBe(true)
  expect(result.requiresConfirmationProof).toBe(true)
  expect(result.reviewSavedPlanOwnershipProved).toBe(false)
  expect(result.blockers.map((row) => row.code)).toContain(
    "PRIOR_SAVED_POSTING_PLAN_CONTRACT_REQUIRED",
  )
  const posting = originals[0]
  if (!posting) throw new Error("Missing selected source")
  posting.input.lines.reverse()
  expect(() =>
    audit({
      book: f.source.book,
      prior: f.prior,
      facts: f.facts,
      expectedPostings: originals,
    }),
  ).toThrow("fingerprint")
})

test("receipt duplicates share one exact original; conflicting owners and crossed scope refuse", () => {
  const f = fixture()
  const original = f.proof.originalPosting
  expect(
    select(scope, f.prior, [original, structuredClone(original)]),
  ).toHaveLength(1)
  const changed = structuredClone(original)
  changed.input.actorUserId = "different-receiver"
  expect(() => select(scope, f.prior, [original, changed])).toThrow(
    "ownership conflicts",
  )
  changed.input.bookId = "foreign"
  expect(() => select(scope, f.prior, [changed])).toThrow("crosses Tenant/Book")
  const sibling = structuredClone(original)
  sibling.entryId = "another-entry"
  const refs = {
    journals: [
      { journalEntryId: original.entryId },
      { journalEntryId: sibling.entryId },
    ],
    evidence: [],
  }
  expect(() => select(scope, refs, [original, sibling])).toThrow(
    "ownership conflicts",
  )
})

test("unreferenced originals stay out of the fact read; selected inputs are detached", () => {
  const f = fixture()
  expect(
    select(scope, { journals: [], evidence: [] }, [f.proof.originalPosting]),
  ).toEqual([])
  const selected = select(
    scope,
    { journals: [], evidence: [{ sourceJournalEntryId: "journal" }] },
    [f.proof.originalPosting],
  )
  const before = financePayloadHash(selected)
  f.proof.originalPosting.input.effectiveAt.setUTCFullYear(2000)
  const line = f.proof.originalPosting.input.lines[0]
  if (!line) throw new Error("Missing original line")
  line.amountMinor = "999"
  expect(financePayloadHash(selected)).toBe(before)
  expect(() =>
    select(
      scope,
      f.prior,
      Array.from({ length: 4097 }, () => f.proof.originalPosting),
    ),
  ).toThrow("bounds")
})
