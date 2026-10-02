import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import type {
  PriorCostReviewExpectedPosting,
  PriorCostReviewJournalFacts,
} from "./reviewed-cost-prior-journal-proof"
import { readPriorCostReviewJournalFactsInTransaction as read } from "./reviewed-cost-prior-journal-reader"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import { financePayloadHash, validateFinanceLines } from "./rules"

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing owned fixture fact")
  return value
}

function fixture(inverse = false) {
  const at = new Date("2026-10-01T12:00:00Z")
  const scope = { tenantId: "tenant", actorUserId: "owner", bookId: "book" }
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    timezone: "Africa/Lagos",
    startsAt: at,
    closedThrough: null,
    lastSequence: 2n,
    createdById: "owner",
    createdAt: at,
  }
  const prior: PriorCostReviewSnapshot = {
    reviews: [
      {
        id: "review",
        tenantId: "tenant",
        bookId: "book",
        clientCommandId: "unproved-confirmation",
        payloadHash: "a".repeat(64),
        costTraceHash: "b".repeat(64),
        reviewedSnapshotHash: "c".repeat(64),
        algorithmVersion: "QA_UNPROVED",
        evidenceCutoff: at,
        historyThrough: at,
        reviewedBookSequence: 2n,
        reason: "QA",
        sourceSnapshot: {},
        postingPlan: [],
        actorUserId: "owner",
        createdAt: at,
        _count: { allocations: 0, evidence: 0, poolSnapshots: 1, journals: 1 },
      },
    ],
    journals: [
      {
        id: "link",
        tenantId: "tenant",
        bookId: "book",
        reviewId: "review",
        journalEntryId: inverse ? "inverse" : "original",
        groupKey: "group",
        basis: {},
      },
    ],
    evidence: [],
    allocations: [],
    poolSnapshots: [
      {
        id: "pool-snapshot",
        tenantId: "tenant",
        bookId: "book",
        reviewId: "review",
        poolId: "pool",
        balanceSourceId: "balance",
        quantity: new Prisma.Decimal("1.25"),
        valueBeforeMinor: null,
        valueAfterMinor: 1001n,
        expectedStockRevision: 1,
        expectedMovementCount: 1n,
        expectedValuationSequence: 1n,
      },
    ],
  }
  const facts: PriorCostReviewJournalFacts = {
    entries: [],
    lines: [],
    accounts: [
      { id: "inventory", bookId: "book" },
      { id: "counter", bookId: "book" },
    ],
    stores: [{ id: "store", tenantId: "tenant", currencyCode: "NGN" }],
    postingCommands: [],
  }
  const expected: PriorCostReviewExpectedPosting[] = []
  for (const reversed of inverse ? [false, true] : [false]) {
    const id = reversed ? "inverse" : "original"
    const sequence = reversed ? 2n : 1n
    const input = {
      ...scope,
      clientCommandId: `owned-source-${id}`,
      sourceKind: reversed ? "QA_INVERSE" : "QA_ORIGINAL",
      sourceId: id,
      description: "Original source-owned posting",
      effectiveAt: at,
      storeId: "store",
      ...(reversed ? { reversalOfId: "original" } : {}),
      lines: [
        {
          accountId: "inventory",
          side: reversed ? ("CREDIT" as const) : ("DEBIT" as const),
          amountMinor: "1001",
        },
        {
          accountId: "counter",
          side: reversed ? ("DEBIT" as const) : ("CREDIT" as const),
          amountMinor: "1001",
        },
      ],
    }
    const lines = validateFinanceLines(input.lines)
    const payloadHash = financePayloadHash({
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      description: input.description,
      effectiveAt: at,
      storeId: "store",
      lines,
      ...(reversed ? { reversalOfId: "original" } : {}),
    })
    facts.entries.push({
      id,
      bookId: "book",
      sequence,
      sourceKind: input.sourceKind,
      sourceId: id,
      payloadHash,
      description: input.description,
      storeId: "store",
      actorUserId: "owner",
      effectiveAt: at,
      recordedAt: at,
      reversalOfId: reversed ? "original" : null,
      reversal: inverse && !reversed ? { id: "inverse" } : null,
      _count: { lines: 2 },
    })
    facts.lines.push(
      ...lines.map((line, index) => ({
        ...line,
        id: `${id}-line-${index}`,
        bookId: "book",
        entryId: id,
      })),
    )
    facts.postingCommands.push({
      id: `command-${id}`,
      bookId: "book",
      clientCommandId: input.clientCommandId,
      kind: "POST_JOURNAL",
      payloadHash,
      actorUserId: "owner",
      result: { entryId: id, sequence: sequence.toString() },
    })
    expected.push({ entryId: id, input })
  }
  const calls: Array<{ model: string; args: unknown }> = []
  let beforeEntries: (() => void | Promise<void>) | undefined
  const tx = {
    $queryRaw: async () => [{ id: "book" }],
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      }),
    },
    financeBook: { findUniqueOrThrow: async () => book },
    financeJournalEntry: {
      findMany: async (args: Prisma.FinanceJournalEntryFindManyArgs) => {
        calls.push({ model: "entry", args })
        await beforeEntries?.()
        const clauses = args.where?.OR
        const clause = Array.isArray(clauses) ? clauses[0] : undefined
        const filter = clause?.id
        const ids = filter && typeof filter !== "string" ? filter.in : undefined
        if (!Array.isArray(ids)) throw new Error("Expected bounded ID query")
        return facts.entries.filter(
          (row) =>
            ids.includes(row.id) ||
            (row.reversalOfId !== null && ids.includes(row.reversalOfId)),
        )
      },
    },
    financeJournalLine: {
      findMany: async (args: Prisma.FinanceJournalLineFindManyArgs) => {
        calls.push({ model: "line", args })
        return facts.lines
      },
    },
    financeAccount: {
      findMany: async (args: Prisma.FinanceAccountFindManyArgs) => {
        calls.push({ model: "account", args })
        return facts.accounts
      },
    },
    store: {
      findMany: async (args: Prisma.StoreFindManyArgs) => {
        calls.push({ model: "store", args })
        return facts.stores
      },
    },
    financeCommand: {
      findMany: async (args: Prisma.FinanceCommandFindManyArgs) => {
        calls.push({ model: "command", args })
        return facts.postingCommands
      },
    },
  } as unknown as Prisma.TransactionClient // Deliberately incomplete simulated transaction; no DB acceptance claim.
  return {
    scope,
    prior,
    facts,
    expected,
    calls,
    tx,
    setBeforeEntries: (value: typeof beforeEntries) => {
      beforeEntries = value
    },
  }
}

test("reads complete reciprocal closure from an inverse root with scoped bounded queries and exact original commands", async () => {
  const f = fixture(true)
  const context = await ReviewedCostBookContext.acquire(f.tx, f.scope)
  const result = await read(f.tx, f.scope, f.prior, context, f.expected)
  expect(result?.facts.entries.map((row) => row.id)).toEqual([
    "inverse",
    "original",
  ])
  expect(result?.proof.postedJournalFactsProved).toBe(true)
  expect(result?.proof.requiresMonetaryProof).toBe(true)
  expect(result?.proof.requiresConfirmationProof).toBe(true)
  expect(result?.proof.reviewSavedPlanOwnershipProved).toBe(false)
  expect(f.calls.filter((call) => call.model === "entry")).toHaveLength(2)
  expect(f.calls[0]?.args).toMatchObject({
    where: {
      bookId: "book",
      book: { tenantId: "tenant" },
      OR: [{ id: { in: ["inverse"] } }, { reversalOfId: { in: ["inverse"] } }],
    },
    take: 4097,
    select: {
      _count: { select: { lines: true } },
      reversal: { select: { id: true } },
    },
  })
  expect(f.calls.find((call) => call.model === "line")?.args).toMatchObject({
    where: {
      bookId: "book",
      entryId: { in: ["inverse", "original"] },
      entry: { book: { tenantId: "tenant" } },
    },
    take: 32769,
  })
  expect(f.calls.find((call) => call.model === "store")?.args).toMatchObject({
    where: { tenantId: "tenant", currencyCode: "NGN" },
  })
  expect(f.calls.find((call) => call.model === "command")?.args).toMatchObject({
    where: {
      clientCommandId: {
        in: ["owned-source-inverse", "owned-source-original"],
      },
    },
    take: 4097,
  })
})

test("no prior facts returns null without new queries; held scope cannot be borrowed", async () => {
  const f = fixture()
  const context = await ReviewedCostBookContext.acquire(f.tx, f.scope)
  const empty: PriorCostReviewSnapshot = {
    reviews: [],
    journals: [],
    evidence: [],
    allocations: [],
    poolSnapshots: [],
  }
  expect(await read(f.tx, f.scope, empty, context)).toBeNull()
  expect(f.calls).toHaveLength(0)
  await expect(
    read(f.tx, { ...f.scope, actorUserId: "other" }, empty, context),
  ).rejects.toThrow("cannot cross")
  await expect(read(fixture().tx, f.scope, empty, context)).rejects.toThrow(
    "cannot cross",
  )
  expect(f.calls).toHaveLength(0)
})

test("snapshots exact Decimal quantities, references and ordered source inputs before awaiting queries", async () => {
  const f = fixture()
  const context = await ReviewedCostBookContext.acquire(f.tx, f.scope)
  f.setBeforeEntries(() => {
    required(f.prior.journals[0]).journalEntryId = "changed"
    required(f.prior.poolSnapshots[0]).quantity = new Prisma.Decimal("999")
    required(f.expected[0]).input.lines.reverse()
    f.scope.bookId = "changed"
  })
  const result = await read(f.tx, f.scope, f.prior, context, f.expected)
  expect(result?.proof.postedJournalFactsProved).toBe(true)
  expect(result?.facts.entries[0]?.id).toBe("original")
  expect(f.calls[0]?.args).toMatchObject({ where: { bookId: "book" } })
})

for (const corruption of [
  "missing-original",
  "omitted-reciprocal",
  "line-missing",
  "foreign-account",
  "foreign-store",
  "wrong-command",
  "extra-entry",
] as const) {
  test(`refuses ${corruption} rather than accepting a partial journal read`, async () => {
    const f = fixture(true)
    const context = await ReviewedCostBookContext.acquire(f.tx, f.scope)
    const original = required(
      f.facts.entries.find((row) => row.id === "original"),
    )
    if (corruption === "missing-original")
      f.facts.entries = f.facts.entries.filter((row) => row.id !== "original")
    if (corruption === "omitted-reciprocal") original.reversal = null
    if (corruption === "line-missing") f.facts.lines.pop()
    if (corruption === "foreign-account")
      required(f.facts.accounts[0]).bookId = "foreign"
    if (corruption === "foreign-store")
      required(f.facts.stores[0]).tenantId = "foreign"
    if (corruption === "wrong-command")
      required(f.facts.postingCommands[0]).payloadHash = "d".repeat(64)
    if (corruption === "extra-entry") {
      const extra = {
        ...original,
        id: "extra",
        reversalOfId: "inverse",
        reversal: null,
      }
      f.facts.entries.push(extra)
    }
    await expect(
      read(f.tx, f.scope, f.prior, context, f.expected),
    ).rejects.toThrow()
  })
}

test("header aggregate overflow refuses before allocating or reading lines", async () => {
  const f = fixture()
  const context = await ReviewedCostBookContext.acquire(f.tx, f.scope)
  const entry = required(f.facts.entries[0])
  f.facts.entries = Array.from({ length: 328 }, (_, index) => ({
    ...entry,
    id: index === 0 ? "original" : `entry-${index}`,
    reversalOfId: index === 0 ? null : "original",
    _count: { lines: 100 },
  }))
  await expect(read(f.tx, f.scope, f.prior, context)).rejects.toThrow(
    "line count exceeds",
  )
  expect(f.calls.some((call) => call.model === "line")).toBe(false)
})

test("without source-derived ordered posting input, real journal facts retain the original-posting blocker", async () => {
  const f = fixture()
  const context = await ReviewedCostBookContext.acquire(f.tx, f.scope)
  f.facts.postingCommands = []
  const result = await read(f.tx, f.scope, f.prior, context)
  expect(result?.proof.postedJournalFactsProved).toBe(false)
  expect(result?.proof.blockers).toContainEqual({
    code: "PRIOR_JOURNAL_ORIGINAL_POSTING_INPUT_REQUIRED",
    sourceId: "original",
  })
  expect(f.calls.some((call) => call.model === "command")).toBe(false)
})
