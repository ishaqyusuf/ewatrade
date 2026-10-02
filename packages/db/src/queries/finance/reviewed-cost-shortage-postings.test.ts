import { expect, test } from "bun:test"
import { financePostingCommandId } from "./commands"
import { auditPriorCostReviewJournalProof as audit } from "./reviewed-cost-prior-journal-proof"
import {
  bindReviewedShortagePostings as bind,
  captureReviewedShortageCandidates as capture,
} from "./reviewed-cost-shortage-postings"
import { financePayloadHash, validateFinanceLines } from "./rules"

const scope = { tenantId: "tenant", bookId: "book" }
const at = new Date("2026-09-30T12:00:00Z")
const accounts = [
  {
    id: "expense",
    bookId: "book",
    code: "6000",
    kind: "EXPENSE",
    purpose: "OPERATING_EXPENSE",
  },
  {
    id: "inventory",
    bookId: "book",
    code: "1300",
    kind: "ASSET",
    purpose: "INVENTORY",
  },
]
function fixture(kind: "STOCK_COUNT" | "INVENTORY_CLOSEOUT" = "STOCK_COUNT") {
  const operation = {
    id: "operation",
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "historical-owner",
    effectiveAt: new Date(at),
  }
  const event = {
    ...scope,
    sourceKind: kind,
    sourceId: "document",
    stockOperationId: "operation",
    stockMovementId: "movement",
    actorUserId: operation.actorUserId,
    effectiveAt: new Date(at),
    canonicalEffect: { toFixed: () => "-1" },
    sourceCostMinor: 1001n,
    valueBeforeMinor: 3001n,
    valueDeltaMinor: -1001n,
    valueAfterMinor: 2000n,
    unknownReason: null as string | null,
  }
  const source = {
    ...scope,
    kind,
    documentId: "document",
    operation,
    events: [event],
  }
  const entries = [
    {
      id: "journal",
      bookId: "book",
      sourceKind:
        kind === "STOCK_COUNT"
          ? "INVENTORY_COUNT_SHORTAGE"
          : "INVENTORY_CLOSEOUT_SHORTAGE",
      sourceId: "movement",
      reversalOfId: null as string | null,
    },
  ]
  return { source, event, entries }
}
function originalProof(
  kind: "STOCK_COUNT" | "INVENTORY_CLOSEOUT",
): Parameters<typeof audit>[0] {
  const f = fixture(kind)
  const expectedPostings = bind({
    scope,
    candidates: capture(f.source),
    entries: f.entries,
    accounts,
  })
  const p = expectedPostings[0]?.input
  if (!p) throw new Error("Missing source fixture")
  const lines = validateFinanceLines(p.lines)
  const hash = financePayloadHash({
    sourceKind: p.sourceKind,
    sourceId: p.sourceId,
    description: p.description,
    effectiveAt: p.effectiveAt,
    storeId: p.storeId,
    lines,
  })
  return {
    book: {
      id: "book",
      tenantId: "tenant",
      currencyCode: "NGN",
      lastSequence: 1n,
    },
    prior: {
      reviews: [
        {
          id: "review",
          ...scope,
          clientCommandId: "unimplemented-confirmation",
          payloadHash: "a".repeat(64),
          costTraceHash: "b".repeat(64),
          reviewedSnapshotHash: "c".repeat(64),
          algorithmVersion: "QA_PENDING",
          evidenceCutoff: at,
          historyThrough: at,
          reviewedBookSequence: 1n,
          reason: "QA",
          sourceSnapshot: { qaOnly: true },
          postingPlan: [],
          actorUserId: "reviewer",
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
          ...scope,
          reviewId: "review",
          journalEntryId: "journal",
          groupKey: "group",
          basis: { qaOnly: true },
        },
      ],
    },
    facts: {
      entries: [
        {
          id: "journal",
          bookId: "book",
          sequence: 1n,
          sourceKind: p.sourceKind,
          sourceId: p.sourceId,
          payloadHash: hash,
          description: p.description,
          storeId: "store",
          actorUserId: p.actorUserId,
          effectiveAt: p.effectiveAt,
          recordedAt: at,
          reversalOfId: null,
          reversal: null,
          _count: { lines: 2 },
        },
      ],
      lines: lines
        .map((line, index) => ({
          ...line,
          id: `unordered-${1 - index}`,
          bookId: "book",
          entryId: "journal",
        }))
        .reverse(),
      accounts: accounts.map((a) => ({ id: a.id, bookId: a.bookId })),
      stores: [{ id: "store", tenantId: "tenant", currencyCode: "NGN" }],
      postingCommands: [
        {
          id: "command",
          bookId: "book",
          clientCommandId: p.clientCommandId,
          kind: "POST_JOURNAL",
          payloadHash: hash,
          actorUserId: p.actorUserId,
          result: { entryId: "journal", sequence: "1" },
        },
      ],
    },
    expectedPostings,
  }
}
test("count and closeout originals retain writer order, exact command, original actor/date and Store", () => {
  for (const kind of ["STOCK_COUNT", "INVENTORY_CLOSEOUT"] as const) {
    const f = fixture(kind)
    const candidates = capture(f.source)
    const posting = bind({ scope, candidates, entries: f.entries, accounts })[0]
      ?.input
    expect(posting?.actorUserId).toBe("historical-owner")
    expect(posting?.effectiveAt).toEqual(at)
    expect(posting?.storeId).toBe("store")
    expect(posting?.clientCommandId).toBe(
      financePostingCommandId(
        `${kind === "STOCK_COUNT" ? "inventory-count" : "inventory-closeout"}:${f.entries[0]?.sourceKind}:movement`,
        "posting",
      ),
    )
    expect(posting?.lines).toEqual([
      { accountId: "expense", side: "DEBIT", amountMinor: "1001" },
      { accountId: "inventory", side: "CREDIT", amountMinor: "1001" },
    ])
    f.source.operation.effectiveAt.setUTCFullYear(2040)
    expect(candidates[0]?.effectiveAt).toEqual(at)
    if (posting) posting.effectiveAt.setUTCFullYear(2050)
    expect(candidates[0]?.effectiveAt).toEqual(at)
  }
})
test("unknown costs, known zero and positive stock gains do not invent shortage journals", () => {
  for (const kind of ["STOCK_COUNT", "INVENTORY_CLOSEOUT"] as const) {
    const f = fixture(kind)
    expect(
      capture({
        ...f.source,
        events: [
          {
            ...f.event,
            sourceCostMinor: null,
            valueDeltaMinor: null,
            valueAfterMinor: null,
            unknownReason: "UNCAPTURED_MOVEMENTS",
          },
        ],
      }),
    ).toEqual([])
    expect(
      capture({
        ...f.source,
        events: [
          {
            ...f.event,
            sourceCostMinor: 0n,
            valueBeforeMinor: 0n,
            valueDeltaMinor: 0n,
            valueAfterMinor: 0n,
          },
        ],
      }),
    ).toEqual([])
    expect(
      capture({
        ...f.source,
        events: [{ ...f.event, canonicalEffect: { toFixed: () => "1" } }],
      }),
    ).toEqual([])
  }
})
test("source scope, original provenance, malformed costs and duplicate complete events refuse", () => {
  const f = fixture()
  for (const event of [
    { ...f.event, bookId: "other" },
    { ...f.event, tenantId: "other" },
    { ...f.event, actorUserId: "reviewer" },
    { ...f.event, effectiveAt: new Date("2026-10-01") },
    { ...f.event, sourceId: "other" },
    { ...f.event, valueAfterMinor: 2001n },
    { ...f.event, sourceCostMinor: -1n },
    { ...f.event, unknownReason: "PRIOR_UNKNOWN_COST" },
  ])
    expect(() => capture({ ...f.source, events: [event] })).toThrow()
  expect(() => capture({ ...f.source, events: [f.event, f.event] })).toThrow(
    "complete event set",
  )
})
test("original bindings reject reversed/wrong/duplicate journals and missing historical controls", () => {
  const f = fixture()
  const candidates = capture(f.source)
  const entry = f.entries[0]
  if (!entry) throw new Error("Missing journal fixture")
  for (const entries of [
    [{ ...entry, bookId: "other" }],
    [{ ...entry, sourceId: "other" }],
    [{ ...entry, reversalOfId: "original" }],
    [...f.entries, ...f.entries],
  ])
    expect(() => bind({ scope, candidates, entries, accounts })).toThrow()
  expect(() =>
    bind({
      scope,
      candidates,
      entries: f.entries,
      accounts: accounts.slice(0, 1),
    }),
  ).toThrow("control account")
  expect(() =>
    bind({
      scope,
      candidates: [...candidates, ...candidates],
      entries: f.entries,
      accounts,
    }),
  ).toThrow("repeats an original")
  expect(() =>
    bind({
      scope: { ...scope, tenantId: "other" },
      candidates,
      entries: f.entries,
      accounts,
    }),
  ).toThrow("Tenant/Book")
})
test("new original shortage templates feed actual journal proof while fiscal/confirmation gates stay open", () => {
  for (const kind of ["STOCK_COUNT", "INVENTORY_CLOSEOUT"] as const) {
    const f = originalProof(kind)
    const proof = audit(f)
    expect(proof.provedOriginalPostingEntryIds).toEqual(["journal"])
    expect(proof.postedJournalFactsProved).toBe(true)
    expect(proof.reviewSavedPlanOwnershipProved).toBe(false)
    expect(
      proof.blockers.some(
        (b) => b.code === "PRIOR_CONFIRMATION_PROOF_REQUIRED",
      ),
    ).toBe(true)
    const entry = f.facts.entries[0]
    if (!entry) throw new Error("Missing journal")
    entry.actorUserId = "reviewer"
    expect(() => audit(f)).toThrow("exact repository original posting source")
  }
})
