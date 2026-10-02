import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { resolveHistoricalCommerceInventoryCostPosting } from "./inventory-cost-posting-source"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import type { PriorCostReviewExpectedPosting } from "./reviewed-cost-prior-journal-proof"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import { FinanceError } from "./rules"

type Order = {
  id: string
  tenantId: string
  currencyCode: string
  _count: { lines: number }
}
type Line = {
  id: string
  orderId: string
  _count: { productFulfillments: number; serviceJobLines: number }
}
function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Original Commerce COGS source exceeds complete bounds or differs from held scope.",
  )
}
function count(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 4096) conflict()
  return value
}

/** Check full original obligations before any existing composer hydrates relations. */
export function assertReviewedCommerceCostReadBounds(input: {
  tenantId: string
  currencyCode: string
  orderIds: string[]
  orders: Order[]
  lines: Line[]
}) {
  const { orderIds, orders, lines } = input
  if (
    !orderIds.length ||
    orderIds.length > 128 ||
    new Set(orderIds).size !== orderIds.length ||
    orderIds.some((id) => !id.trim()) ||
    orders.length !== orderIds.length ||
    new Set(orders.map((o) => o.id)).size !== orders.length ||
    orders.some(
      (o) =>
        !orderIds.includes(o.id) ||
        o.tenantId !== input.tenantId ||
        o.currencyCode !== input.currencyCode,
    ) ||
    orders.reduce((n, o) => n + count(o._count.lines), 0) > 128 ||
    lines.length > 128 ||
    new Set(lines.map((l) => l.id)).size !== lines.length ||
    lines.some((l) => !l.id.trim() || !orderIds.includes(l.orderId)) ||
    orders.some(
      (o) => lines.filter((l) => l.orderId === o.id).length !== o._count.lines,
    ) ||
    lines.reduce(
      (n, l) =>
        n +
        count(l._count.productFulfillments) +
        count(l._count.serviceJobLines),
      0,
    ) > 4096
  )
    conflict()
}

/** Private original-source read: references locate journals, never supply cost/actor. */
export async function readReviewedCommerceCostPostingsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
  context: ReviewedCostBookContext,
  prior: PriorCostReviewSnapshot,
  original: Awaited<ReturnType<typeof readReviewedCostReturnsInTransaction>>,
): Promise<PriorCostReviewExpectedPosting[]> {
  const book = context.read(tx, input)
  const snapshot = original.snapshot
  if (
    snapshot.tenantId !== book.tenantId ||
    snapshot.bookId !== book.id ||
    snapshot.currencyCode !== book.currencyCode ||
    snapshot.lines.length > 128 ||
    prior.journals.length > 4096 ||
    prior.evidence.length > 4096 ||
    [...prior.journals, ...prior.evidence].some(
      (row) => row.tenantId !== book.tenantId || row.bookId !== book.id,
    )
  )
    conflict()
  const lockedOrderIds = [...new Set(snapshot.lines.map((l) => l.orderId))]
  const referencedIds = [
    ...new Set([
      ...prior.journals.map((j) => j.journalEntryId),
      ...prior.evidence.flatMap((e) =>
        e.sourceJournalEntryId === null ? [] : [e.sourceJournalEntryId],
      ),
    ]),
  ]
  if (
    referencedIds.length > 4096 ||
    [...lockedOrderIds, ...referencedIds].some((id) => !id.trim())
  )
    conflict()
  if (!lockedOrderIds.length || !referencedIds.length) return []
  const entries = await tx.financeJournalEntry.findMany({
    where: {
      id: { in: referencedIds },
      bookId: book.id,
      book: { tenantId: book.tenantId },
      sourceKind: "COMMERCIAL_ORDER_COGS",
      sourceId: { in: lockedOrderIds },
      reversalOfId: null,
    },
    select: { id: true, bookId: true, sourceKind: true, sourceId: true },
    orderBy: { id: "asc" },
    take: 129,
  })
  if (!entries.length) return []
  if (
    entries.length > 128 ||
    new Set(entries.map((e) => e.id)).size !== entries.length ||
    new Set(entries.map((e) => e.sourceId)).size !== entries.length ||
    entries.some(
      (e) =>
        e.bookId !== book.id ||
        e.sourceKind !== "COMMERCIAL_ORDER_COGS" ||
        !lockedOrderIds.includes(e.sourceId) ||
        !referencedIds.includes(e.id),
    )
  )
    conflict()
  const orderIds = entries.map((e) => e.sourceId)
  await assertReviewedCommerceOrderSourcesInTransaction(tx, book, orderIds)
  const result: PriorCostReviewExpectedPosting[] = []
  for (const entry of entries) {
    const source = await resolveHistoricalCommerceInventoryCostPosting(
      tx,
      { ...input, orderId: entry.sourceId },
      context,
    )
    // Unknown, zero or incomplete original cost cannot justify a posted journal.
    if (!source) conflict()
    if (
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

/** Full original Order scope is already locked by connected source coordination. */
export async function assertReviewedCommerceOrderSourcesInTransaction(
  tx: Prisma.TransactionClient,
  book: { id: string; tenantId: string; currencyCode: string },
  orderIds: string[],
) {
  const orders = await tx.commercialOrder.findMany({
    where: {
      id: { in: orderIds },
      tenantId: book.tenantId,
      currencyCode: book.currencyCode,
    },
    select: {
      id: true,
      tenantId: true,
      currencyCode: true,
      _count: { select: { lines: true } },
    },
    orderBy: { id: "asc" },
    take: 129,
  })
  if (orders.reduce((n, o) => n + count(o._count.lines), 0) > 128) conflict()
  const lines = await tx.commercialOrderLine.findMany({
    where: { orderId: { in: orderIds } },
    select: {
      id: true,
      orderId: true,
      _count: { select: { productFulfillments: true, serviceJobLines: true } },
    },
    orderBy: { id: "asc" },
    take: 129,
  })
  assertReviewedCommerceCostReadBounds({
    tenantId: book.tenantId,
    currencyCode: book.currencyCode,
    orderIds,
    orders,
    lines,
  })
  const fulfillments = await tx.productFulfillment.findMany({
    where: { orderLineId: { in: lines.map((l) => l.id) } },
    select: {
      id: true,
      orderLineId: true,
      stockOperation: { select: { _count: { select: { movements: true } } } },
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    fulfillments.length > 4096 ||
    new Set(fulfillments.map((f) => f.id)).size !== fulfillments.length ||
    fulfillments.some(
      (f) =>
        !lines.some((l) => l.id === f.orderLineId) ||
        f.stockOperation._count.movements !== 1,
    ) ||
    lines.some(
      (l) =>
        fulfillments.filter((f) => f.orderLineId === l.id).length !==
        l._count.productFulfillments,
    )
  )
    conflict()
}
