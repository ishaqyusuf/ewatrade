import { expect, test } from "bun:test"
import {
  auditPriorCostReviewJournalProof as audit,
  planPriorCostReviewJournalFactRead as plan,
} from "./reviewed-cost-prior-journal-proof"
import { financePayloadHash, validateFinanceLines } from "./rules"

type Input = Parameters<typeof audit>[0]
const at = new Date("2026-10-01T12:00:00Z")
function fixture(): Input {
  const posting = {
    tenantId: "tenant",
    bookId: "book",
    actorUserId: "actor",
    clientCommandId: "exact-original-source-command",
    sourceKind: "QA_SUPPORTED_ORIGINAL_SOURCE",
    sourceId: "original-source",
    description: "Original posting",
    effectiveAt: at,
    storeId: "store",
    lines: [
      { accountId: "inventory", side: "DEBIT" as const, amountMinor: "1001" },
      { accountId: "counter", side: "CREDIT" as const, amountMinor: "1001" },
    ],
  }
  const normalized = validateFinanceLines(posting.lines)
  const payloadHash = financePayloadHash({
    sourceKind: posting.sourceKind,
    sourceId: posting.sourceId,
    description: posting.description,
    effectiveAt: posting.effectiveAt,
    storeId: posting.storeId,
    lines: normalized,
  })
  return {
    book: {
      id: "book",
      tenantId: "tenant",
      currencyCode: "NGN",
      lastSequence: 9007199254740995n,
    },
    prior: {
      reviews: [
        {
          id: "review",
          tenantId: "tenant",
          bookId: "book",
          clientCommandId: "unimplemented-confirmation-command",
          payloadHash: "a".repeat(64),
          costTraceHash: "b".repeat(64),
          reviewedSnapshotHash: "c".repeat(64),
          algorithmVersion: "QA_UNIMPLEMENTED_REVIEW",
          evidenceCutoff: at,
          historyThrough: at,
          reviewedBookSequence: 9007199254740993n,
          reason: "QA",
          sourceSnapshot: { qaOnly: true },
          postingPlan: [],
          actorUserId: "actor",
          createdAt: at,
          _count: {
            allocations: 0,
            poolSnapshots: 0,
            evidence: 0,
            journals: 1,
          },
        },
      ],
      allocations: [],
      poolSnapshots: [],
      evidence: [],
      journals: [
        {
          id: "link",
          tenantId: "tenant",
          bookId: "book",
          reviewId: "review",
          journalEntryId: "entry",
          groupKey: "group",
          basis: { qaOnly: true },
        },
      ],
    },
    facts: {
      entries: [
        {
          id: "entry",
          bookId: "book",
          sequence: 9007199254740993n,
          sourceKind: posting.sourceKind,
          sourceId: posting.sourceId,
          payloadHash,
          description: posting.description,
          storeId: "store",
          actorUserId: "actor",
          effectiveAt: at,
          recordedAt: at,
          reversalOfId: null,
          reversal: null,
          _count: { lines: 2 },
        },
      ],
      lines: normalized.map((line, index) => ({
        ...line,
        id: `line${index}`,
        bookId: "book",
        entryId: "entry",
      })),
      accounts: [
        { id: "inventory", bookId: "book" },
        { id: "counter", bookId: "book" },
      ],
      stores: [{ id: "store", tenantId: "tenant", currencyCode: "NGN" }],
      postingCommands: [
        {
          id: "posting-command",
          bookId: "book",
          clientCommandId: posting.clientCommandId,
          kind: "POST_JOURNAL",
          payloadHash,
          actorUserId: "actor",
          result: { entryId: "entry", sequence: "9007199254740993" },
        },
      ],
    },
    expectedPostings: [{ entryId: "entry", input: posting }],
  }
}
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error("Missing QA row")
  return row
}
function inverseFixture(): Input {
  const f = fixture()
  const original = first(f.facts.entries)
  const posting = first(f.expectedPostings ?? []).input
  original.reversal = { id: "inverse" }
  const input = {
    ...posting,
    clientCommandId: "exact-original-reversal-command",
    sourceKind: "QA_SOURCE_REVERSAL",
    sourceId: "entry",
    description: "Inverse posting",
    reversalOfId: "entry",
    lines: posting.lines.map((line) => ({
      ...line,
      side: line.side === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
    })),
  }
  const normalized = validateFinanceLines(input.lines)
  const payloadHash = financePayloadHash({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    description: input.description,
    effectiveAt: input.effectiveAt,
    storeId: input.storeId,
    lines: normalized,
    reversalOfId: "entry",
  })
  f.facts.entries.push({
    ...original,
    id: "inverse",
    sequence: 9007199254740994n,
    sourceKind: input.sourceKind,
    sourceId: "entry",
    description: input.description,
    payloadHash,
    reversalOfId: "entry",
    reversal: null,
  })
  f.facts.lines.push(
    ...normalized.map((line, index) => ({
      ...line,
      id: `inverse-line${index}`,
      bookId: "book",
      entryId: "inverse",
    })),
  )
  f.facts.postingCommands.push({
    id: "reversal-command",
    bookId: "book",
    clientCommandId: input.clientCommandId,
    kind: "POST_JOURNAL",
    payloadHash,
    actorUserId: "actor",
    result: { entryId: "inverse", sequence: "9007199254740994" },
  })
  f.expectedPostings?.push({ entryId: "inverse", input })
  return f
}
test("exact original writer payload, accounts, amounts, actor and string BIGINT command result are proved without inventing saved-plan authority", () => {
  const f = fixture()
  const before = financePayloadHash(f)
  const proof = audit(f)
  expect(proof.postedJournalFactsProved).toBe(true)
  expect(proof.provedOriginalPostingEntryIds).toEqual(["entry"])
  expect(proof.reviewSavedPlanOwnershipProved).toBe(false)
  expect(proof.requiresPriorReviewProof).toBe(true)
  expect(proof.requiresConfirmationProof).toBe(true)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_SAVED_POSTING_PLAN_CONTRACT_REQUIRED",
  )
  expect(financePayloadHash(f)).toBe(before)
})
test("unordered stored journal lines do not replace original ordered writer payload", () => {
  const f = fixture()
  f.facts.lines.reverse()
  expect(audit(f).postedJournalFactsProved).toBe(true)
})
test("valid FK and balanced journal without immutable original posting input remain blocked", () => {
  const f = fixture()
  f.expectedPostings = []
  f.facts.postingCommands = []
  const proof = audit(f)
  expect(proof.postedJournalFactsProved).toBe(false)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_JOURNAL_ORIGINAL_POSTING_INPUT_REQUIRED",
  )
})
test("empty QA posting plan cannot establish zero-journal confirmation", () => {
  const f = fixture()
  f.prior.journals = []
  first(f.prior.reviews)._count.journals = 0
  f.facts = {
    entries: [],
    lines: [],
    accounts: [],
    stores: [],
    postingCommands: [],
  }
  f.expectedPostings = []
  const proof = audit(f)
  expect(proof.postedJournalFactsProved).toBe(false)
  expect(proof.reviewSavedPlanOwnershipProved).toBe(false)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_SAVED_POSTING_PLAN_CONTRACT_REQUIRED",
  )
})
test("exact inverse preserves original accounts and monetary amounts but keeps actual reversed adjustment state blocked", () => {
  const proof = audit(inverseFixture())
  expect(proof.postedJournalFactsProved).toBe(true)
  expect(proof.inverseEntryIds).toEqual(["inverse"])
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_ADJUSTMENT_JOURNAL_STATE_REQUIRED",
  )
})
const corruption: Array<[string, (f: Input) => void]> = [
  [
    "crossed reference Tenant",
    (f) => {
      first(f.prior.journals).tenantId = "other"
    },
  ],
  [
    "crossed journal Book",
    (f) => {
      first(f.facts.entries).bookId = "other"
    },
  ],
  [
    "missing journal",
    (f) => {
      f.facts.entries = []
    },
  ],
  [
    "extra unreferenced journal",
    (f) => {
      f.facts.entries.push({ ...first(f.facts.entries), id: "unrelated" })
    },
  ],
  [
    "duplicate journal",
    (f) => {
      f.facts.entries.push(first(f.facts.entries))
    },
  ],
  [
    "truncated original lines",
    (f) => {
      f.facts.lines.pop()
    },
  ],
  [
    "wrong header reference count",
    (f) => {
      first(f.prior.reviews)._count.journals = 2
    },
  ],
  [
    "crossed line Book",
    (f) => {
      first(f.facts.lines).bookId = "other"
    },
  ],
  [
    "orphan line",
    (f) => {
      first(f.facts.lines).entryId = "other"
    },
  ],
  [
    "duplicate original line",
    (f) => {
      f.facts.lines[1] = first(f.facts.lines)
    },
  ],
  [
    "zero original line",
    (f) => {
      first(f.facts.lines).debitMinor = 0n
    },
  ],
  [
    "dual sided line",
    (f) => {
      first(f.facts.lines).creditMinor = 1001n
    },
  ],
  [
    "unsupported amount",
    (f) => {
      for (const l of f.facts.lines) {
        if (l.debitMinor) l.debitMinor = 100000000000001n
        else l.creditMinor = 100000000000001n
      }
    },
  ],
  [
    "unbalanced original",
    (f) => {
      first(f.facts.lines).debitMinor = 1000n
    },
  ],
  [
    "missing account",
    (f) => {
      f.facts.accounts.pop()
    },
  ],
  [
    "crossed account",
    (f) => {
      first(f.facts.accounts).bookId = "other"
    },
  ],
  [
    "crossed Store Tenant",
    (f) => {
      first(f.facts.stores).tenantId = "other"
    },
  ],
  [
    "crossed Store currency",
    (f) => {
      first(f.facts.stores).currencyCode = "USD"
    },
  ],
  [
    "zero sequence",
    (f) => {
      first(f.facts.entries).sequence = 0n
    },
  ],
  [
    "future watermark sequence",
    (f) => {
      first(f.facts.entries).sequence = 9007199254740996n
    },
  ],
  [
    "invalid saved date",
    (f) => {
      first(f.facts.entries).effectiveAt = new Date(Number.NaN)
    },
  ],
  [
    "changed source owner",
    (f) => {
      first(f.facts.entries).sourceId = "other"
    },
  ],
  [
    "changed original actor",
    (f) => {
      first(f.facts.entries).actorUserId = "other"
    },
  ],
  [
    "changed original fingerprint",
    (f) => {
      first(f.facts.entries).payloadHash = "d".repeat(64)
    },
  ],
  [
    "same balanced total different accounts",
    (f) => {
      for (const l of f.facts.lines)
        l.accountId = l.accountId === "inventory" ? "counter" : "inventory"
    },
  ],
  [
    "changed immutable writer order",
    (f) => {
      first(f.expectedPostings ?? []).input.lines.reverse()
    },
  ],
  [
    "wrong original command",
    (f) => {
      first(f.facts.postingCommands).clientCommandId = "other"
    },
  ],
  [
    "wrong command kind",
    (f) => {
      first(f.facts.postingCommands).kind = "CONFIRM_COST"
    },
  ],
  [
    "wrong command actor",
    (f) => {
      first(f.facts.postingCommands).actorUserId = "other"
    },
  ],
  [
    "wrong command Book",
    (f) => {
      first(f.facts.postingCommands).bookId = "other"
    },
  ],
  [
    "wrong command fingerprint",
    (f) => {
      first(f.facts.postingCommands).payloadHash = "e".repeat(64)
    },
  ],
  [
    "borrowed command journal identity",
    (f) => {
      first(f.facts.postingCommands).result = {
        entryId: "other",
        sequence: "9007199254740993",
      }
    },
  ],
  [
    "unsafe numeric command sequence",
    (f) => {
      first(f.facts.postingCommands).result = {
        entryId: "entry",
        sequence: Number("9007199254740993"),
      }
    },
  ],
  [
    "different string command sequence",
    (f) => {
      first(f.facts.postingCommands).result = {
        entryId: "entry",
        sequence: "9007199254740994",
      }
    },
  ],
]
for (const [label, corrupt] of corruption)
  test(`rejects ${label}`, () => {
    const f = fixture()
    corrupt(f)
    expect(() => audit(f)).toThrow("Prior review journal")
  })
const inverseCorruptions: Array<[string, (f: Input) => void]> = [
  [
    "missing actual reversal",
    (f) => {
      f.facts.entries.pop()
    },
  ],
  [
    "missing original back pointer",
    (f) => {
      first(f.facts.entries).reversal = null
    },
  ],
  [
    "borrowed original identity",
    (f) => {
      const e = f.facts.entries[1]
      if (e) e.reversalOfId = "different"
    },
  ],
  [
    "self inverse",
    (f) => {
      const e = f.facts.entries[1]
      if (e) e.reversalOfId = e.id
    },
  ],
  [
    "same original sequence",
    (f) => {
      const e = f.facts.entries[1]
      if (e) e.sequence = 9007199254740993n
    },
  ],
  [
    "reversed original chronology",
    (f) => {
      const e = f.facts.entries[1]
      if (e) e.recordedAt = new Date("2026-09-01")
    },
  ],
  [
    "different inverse amount",
    (f) => {
      for (const l of f.facts.lines.filter((l) => l.entryId === "inverse")) {
        if (l.debitMinor) l.debitMinor = 1000n
        else l.creditMinor = 1000n
      }
    },
  ],
  [
    "different inverse account",
    (f) => {
      const l = f.facts.lines.find((l) => l.entryId === "inverse")
      if (l) l.accountId = l.accountId === "inventory" ? "counter" : "inventory"
    },
  ],
]
for (const [label, corrupt] of inverseCorruptions)
  test(`rejects ${label}`, () => {
    const f = inverseFixture()
    corrupt(f)
    expect(() => audit(f)).toThrow("Prior review journal")
  })
test("pure loader proposal requests exact original commands and complete reversal/count closure with sentinels", () => {
  const f = fixture()
  const read = plan(f.prior, f.expectedPostings)
  expect(read?.journalEntryIds).toEqual(["entry"])
  expect(read?.postingCommandIds).toEqual(["exact-original-source-command"])
  expect(read?.reviewConfirmationCommandIds).toEqual([
    "unimplemented-confirmation-command",
  ])
  expect(read?.entryTake).toBe(4097)
  expect(read?.lineTake).toBe(32769)
  expect(read?.requiresCompleteReversalClosure).toBe(true)
})
test("no-prior loader proposal is null without producing query work", () => {
  expect(
    plan({
      reviews: [],
      allocations: [],
      poolSnapshots: [],
      evidence: [],
      journals: [],
    }),
  ).toBeNull()
})
test("original evidence referencing a reversed journal retains its original-state blocker", () => {
  const f = inverseFixture()
  first(f.prior.reviews)._count.evidence = 1
  f.prior.evidence.push({
    id: "evidence",
    tenantId: "tenant",
    bookId: "book",
    reviewId: "review",
    allocationId: "not-classified-here",
    mode: "CORRECT_RECORDED",
    classification: "SOURCE_CORRECTION",
    originalCostMinor: 1001n,
    evidenceReference: "QA",
    sourceDocumentKind: "QA",
    sourceDocumentId: null,
    sourceEffectiveAt: at,
    postingEffectiveAt: at,
    counterAccountId: null,
    billLineId: null,
    sourceJournalEntryId: "entry",
    basis: {},
  })
  const proof = audit(f)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_ORIGINAL_JOURNAL_STATE_REQUIRED",
  )
  expect(proof.requiresPostedJournalOwnershipProof).toBe(true)
})
test("extra unsupported posting command alias cannot substitute for the source's exact saved command", () => {
  const f = fixture()
  f.facts.postingCommands.push({
    ...first(f.facts.postingCommands),
    id: "alias",
    clientCommandId: "different-command",
  })
  expect(() => audit(f)).toThrow("complete required identities")
})
test("journal closure overflow is refused before partial monetary proof", () => {
  const f = fixture()
  const e = first(f.facts.entries)
  f.facts.entries = Array.from({ length: 4097 }, (_, i) => ({
    ...e,
    id: `e${i}`,
  }))
  expect(() => audit(f)).toThrow("complete supported bounds")
})
test("matching arbitrary saved source/plan JSON and evidence labels cannot confer original review ownership", () => {
  const f = fixture()
  const review = first(f.prior.reviews)
  review.sourceSnapshot = {
    algorithmVersion: "QA_UNIMPLEMENTED_REVIEW",
    verified: true,
  }
  review.postingPlan = { verified: true, entryId: "entry" }
  const proof = audit(f)
  expect(proof.reviewSavedPlanOwnershipProved).toBe(false)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_SAVED_SOURCE_SNAPSHOT_CONTRACT_REQUIRED",
  )
})
