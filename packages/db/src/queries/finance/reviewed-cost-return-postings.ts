import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { resolveHistoricalCommerceInventoryReturnPosting } from "./inventory-return-posting-source"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { assertReviewedCommerceOrderSourcesInTransaction } from "./reviewed-cost-commerce-postings"
import type { PriorCostReviewExpectedPosting } from "./reviewed-cost-prior-journal-proof"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import { FinanceError } from "./rules"

function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Original restock posting source differs from complete held scope or exceeds bounds.",
  )
}

/** Exact original RESTOCK inputs; source JSON never supplies a cost or posting. */
export async function readReviewedReturnCostPostingsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
  context: ReviewedCostBookContext,
  prior: PriorCostReviewSnapshot,
  original: Awaited<ReturnType<typeof readReviewedCostReturnsInTransaction>>,
): Promise<PriorCostReviewExpectedPosting[]> {
  const book = context.read(tx, input)
  const { snapshot } = original
  if (
    snapshot.tenantId !== book.tenantId ||
    snapshot.bookId !== book.id ||
    snapshot.currencyCode !== book.currencyCode ||
    snapshot.lines.length > 128 ||
    snapshot.returns.length > 4096 ||
    prior.journals.length > 4096 ||
    prior.evidence.length > 4096 ||
    [...prior.journals, ...prior.evidence].some(
      (r) => r.tenantId !== book.tenantId || r.bookId !== book.id,
    )
  )
    conflict()
  const lines = new Map(snapshot.lines.map((l) => [l.id, l.orderId]))
  const returns = new Map(snapshot.returns.map((r) => [r.id, r]))
  const ids = [
    ...new Set([
      ...prior.journals.map((j) => j.journalEntryId),
      ...prior.evidence.flatMap((e) =>
        e.sourceJournalEntryId === null ? [] : [e.sourceJournalEntryId],
      ),
    ]),
  ]
  if (
    lines.size !== snapshot.lines.length ||
    returns.size !== snapshot.returns.length ||
    ids.length > 4096 ||
    [...lines.keys(), ...lines.values(), ...returns.keys(), ...ids].some(
      (id) => !id.trim(),
    ) ||
    snapshot.returns.some((r) => !lines.has(r.orderLineId))
  )
    conflict()
  if (!ids.length || !returns.size) return []
  const entries = await tx.financeJournalEntry.findMany({
    where: {
      id: { in: ids },
      bookId: book.id,
      book: { tenantId: book.tenantId },
      sourceKind: "PRODUCT_RETURN_COGS",
      sourceId: { in: [...returns.keys()] },
      reversalOfId: null,
    },
    select: { id: true, bookId: true, sourceKind: true, sourceId: true },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (!entries.length) return []
  if (
    entries.length > 4096 ||
    new Set(entries.map((e) => e.id)).size !== entries.length ||
    new Set(entries.map((e) => e.sourceId)).size !== entries.length ||
    entries.some(
      (e) =>
        !ids.includes(e.id) ||
        e.bookId !== book.id ||
        e.sourceKind !== "PRODUCT_RETURN_COGS" ||
        returns.get(e.sourceId)?.disposition !== "RESTOCK",
    )
  )
    conflict()
  const orderIds = [
    ...new Set(
      entries.map((e) => {
        const source = returns.get(e.sourceId)
        const orderId = source && lines.get(source.orderLineId)
        if (!orderId) conflict()
        return orderId
      }),
    ),
  ]
  // The return composer also proves the whole gross Order and all prior returns.
  await assertReviewedCommerceOrderSourcesInTransaction(tx, book, orderIds)
  const allReturns = await tx.productReturn.findMany({
    where: { orderId: { in: orderIds }, tenantId: book.tenantId },
    select: {
      id: true,
      orderId: true,
      tenantId: true,
      disposition: true,
      financeCost: { select: { _count: { select: { allocations: true } } } },
      stockOperation: { select: { _count: { select: { movements: true } } } },
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    allReturns.length > 4096 ||
    new Set(allReturns.map((r) => r.id)).size !== allReturns.length ||
    entries.some((e) => !allReturns.some((r) => r.id === e.sourceId)) ||
    allReturns.some(
      (r) =>
        !orderIds.includes(r.orderId) ||
        r.tenantId !== book.tenantId ||
        (r.stockOperation !== null && r.stockOperation._count.movements > 1) ||
        (r.financeCost !== null &&
          (!Number.isSafeInteger(r.financeCost._count.allocations) ||
            r.financeCost._count.allocations < 0)),
    ) ||
    allReturns.reduce(
      (n, r) => n + (r.financeCost?._count.allocations ?? 0),
      0,
    ) > 4096
  )
    conflict()
  const related = await tx.financeJournalEntry.findMany({
    where: {
      bookId: book.id,
      OR: [
        { sourceKind: "COMMERCIAL_ORDER_COGS", sourceId: { in: orderIds } },
        {
          sourceKind: "PRODUCT_RETURN_COGS",
          sourceId: { in: allReturns.map((r) => r.id) },
        },
      ],
    },
    select: { id: true, _count: { select: { lines: true } } },
    orderBy: { id: "asc" },
    take: 4225,
  })
  if (
    related.length > 4224 ||
    new Set(related.map((j) => j.id)).size !== related.length ||
    related.some((j) => j._count.lines !== 2)
  )
    conflict()
  const result: PriorCostReviewExpectedPosting[] = []
  for (const entry of entries) {
    const source = await resolveHistoricalCommerceInventoryReturnPosting(
      tx,
      { ...input, productReturnId: entry.sourceId },
      context,
    )
    if (
      !source ||
      source.book.id !== book.id ||
      source.book.currencyCode !== book.currencyCode ||
      source.input.sourceKind !== entry.sourceKind ||
      source.input.sourceId !== entry.sourceId
    )
      conflict()
    result.push({ entryId: entry.id, input: source.input })
  }
  return result
}
