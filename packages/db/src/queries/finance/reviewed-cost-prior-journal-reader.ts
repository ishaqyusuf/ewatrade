import { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import {
  type PriorCostReviewExpectedPosting,
  type PriorCostReviewJournalFacts,
  auditPriorCostReviewJournalProof,
  planPriorCostReviewJournalFactRead,
} from "./reviewed-cost-prior-journal-proof"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import { FinanceError, financePayloadHash } from "./rules"

const MAX_ENTRIES = 4096
const MAX_LINES = 32768
const entrySelect = {
  id: true,
  bookId: true,
  sequence: true,
  sourceKind: true,
  sourceId: true,
  payloadHash: true,
  description: true,
  storeId: true,
  actorUserId: true,
  effectiveAt: true,
  recordedAt: true,
  reversalOfId: true,
  reversal: { select: { id: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.FinanceJournalEntrySelect

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", `Prior review journal ${message}`)
}

function snapshotPrior(
  prior: PriorCostReviewSnapshot,
): PriorCostReviewSnapshot {
  // Prisma Decimal instances cannot be structured-cloned; retain exact values.
  return {
    reviews: structuredClone(prior.reviews),
    evidence: structuredClone(prior.evidence),
    journals: structuredClone(prior.journals),
    allocations: prior.allocations.map((row) => {
      const {
        quantity,
        quantityBefore,
        quantityAfter,
        originalRemainingQuantityBefore,
        ...facts
      } = row
      return {
        ...structuredClone(facts),
        quantity: new Prisma.Decimal(quantity.toString()),
        quantityBefore: new Prisma.Decimal(quantityBefore.toString()),
        quantityAfter: new Prisma.Decimal(quantityAfter.toString()),
        originalRemainingQuantityBefore:
          originalRemainingQuantityBefore === null
            ? null
            : new Prisma.Decimal(originalRemainingQuantityBefore.toString()),
      }
    }),
    poolSnapshots: prior.poolSnapshots.map(({ quantity, ...facts }) => ({
      ...structuredClone(facts),
      quantity: new Prisma.Decimal(quantity.toString()),
    })),
  }
}

/** Private read-only composition under the actual held Book. No posting input is inferred. */
export async function readPriorCostReviewJournalFactsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
  priorInput: PriorCostReviewSnapshot,
  context: ReviewedCostBookContext,
  expectedInput: PriorCostReviewExpectedPosting[] = [],
) {
  const scope = structuredClone(input)
  const prior = snapshotPrior(priorInput)
  const expectedPostings = structuredClone(expectedInput)
  const book = structuredClone(context.read(tx, scope))
  const plan = planPriorCostReviewJournalFactRead(prior, expectedPostings)
  if (!plan) {
    if (prior.allocations.length || prior.poolSnapshots.length)
      conflict("allocation/pool facts lack their original review header.")
    return null
  }
  for (const row of [
    ...prior.reviews,
    ...prior.journals,
    ...prior.evidence,
    ...prior.allocations,
    ...prior.poolSnapshots,
  ])
    if (row.bookId !== book.id || row.tenantId !== book.tenantId)
      conflict("reference crosses the held Tenant/Book.")
  for (const posting of expectedPostings)
    if (
      posting.input.bookId !== book.id ||
      posting.input.tenantId !== book.tenantId
    )
      conflict("source-derived posting crosses the held Tenant/Book.")

  const entries = new Map<
    string,
    PriorCostReviewJournalFacts["entries"][number]
  >()
  let frontier = plan.journalEntryIds
  while (frontier.length) {
    const rows = await tx.financeJournalEntry.findMany({
      where: {
        bookId: book.id,
        book: { tenantId: book.tenantId },
        OR: [{ id: { in: frontier } }, { reversalOfId: { in: frontier } }],
      },
      select: entrySelect,
      orderBy: { id: "asc" },
      take: MAX_ENTRIES + 1,
    })
    if (
      rows.length > MAX_ENTRIES ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    )
      conflict("entry query exceeds complete bounds or repeats an identity.")
    const returned = new Set(rows.map((row) => row.id))
    if (frontier.some((id) => !returned.has(id)))
      conflict("referenced original/reversal is missing from the held Book.")
    const next = new Set<string>()
    for (const row of rows) {
      if (row.bookId !== book.id || !row.id.trim())
        conflict("loaded entry crosses the held Book or lacks identity.")
      const earlier = entries.get(row.id)
      if (earlier && financePayloadHash(earlier) !== financePayloadHash(row))
        conflict("immutable entry changed while completing reversal closure.")
      entries.set(row.id, row)
      if (entries.size > MAX_ENTRIES)
        conflict("reversal closure exceeds complete bounds.")
      if (row.reversalOfId) next.add(row.reversalOfId)
      if (row.reversal) next.add(row.reversal.id)
    }
    frontier = [...next].filter((id) => !entries.has(id)).sort()
  }

  const entryIds = [...entries.keys()].sort()
  let lineCount = 0
  for (const entry of entries.values()) {
    if (
      !Number.isSafeInteger(entry._count.lines) ||
      entry._count.lines < 2 ||
      entry._count.lines > 100
    )
      conflict("header line count is outside complete posting bounds.")
    lineCount += entry._count.lines
    if (lineCount > MAX_LINES)
      conflict("complete line count exceeds supported bounds.")
  }
  const lines = entryIds.length
    ? await tx.financeJournalLine.findMany({
        where: {
          bookId: book.id,
          entryId: { in: entryIds },
          entry: { book: { tenantId: book.tenantId } },
        },
        select: {
          id: true,
          bookId: true,
          entryId: true,
          accountId: true,
          debitMinor: true,
          creditMinor: true,
          description: true,
        },
        orderBy: { id: "asc" },
        take: MAX_LINES + 1,
      })
    : []
  if (lines.length > MAX_LINES || lines.length !== lineCount)
    conflict("loaded lines differ from complete header counts.")
  const accountIds = [...new Set(lines.map((line) => line.accountId))].sort()
  const storeIds = [
    ...new Set(
      [...entries.values()].flatMap((entry) =>
        entry.storeId === null ? [] : [entry.storeId],
      ),
    ),
  ].sort()
  if (accountIds.length > MAX_ENTRIES || storeIds.length > MAX_ENTRIES)
    conflict("account/Store closure exceeds complete bounds.")
  const accounts = accountIds.length
    ? await tx.financeAccount.findMany({
        where: {
          id: { in: accountIds },
          bookId: book.id,
          book: { tenantId: book.tenantId },
        },
        select: { id: true, bookId: true },
        orderBy: { id: "asc" },
        take: MAX_ENTRIES + 1,
      })
    : []
  const stores = storeIds.length
    ? await tx.store.findMany({
        where: {
          id: { in: storeIds },
          tenantId: book.tenantId,
          currencyCode: book.currencyCode,
        },
        select: { id: true, tenantId: true, currencyCode: true },
        orderBy: { id: "asc" },
        take: MAX_ENTRIES + 1,
      })
    : []
  const postingCommands = plan.postingCommandIds.length
    ? await tx.financeCommand.findMany({
        where: {
          bookId: book.id,
          book: { tenantId: book.tenantId },
          clientCommandId: { in: plan.postingCommandIds },
        },
        select: {
          id: true,
          bookId: true,
          clientCommandId: true,
          kind: true,
          payloadHash: true,
          actorUserId: true,
          result: true,
        },
        orderBy: { id: "asc" },
        take: MAX_ENTRIES + 1,
      })
    : []
  const facts: PriorCostReviewJournalFacts = {
    entries: [...entries.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    lines,
    accounts,
    stores,
    postingCommands,
  }
  const proof = auditPriorCostReviewJournalProof({
    book,
    prior,
    facts,
    expectedPostings,
  })
  return { facts, proof }
}
