import type { Prisma } from "../../../generated/prisma/client"
import {
  reservationCommitSourceInclude,
  resolveLoadedReservationCommitSource,
} from "./inventory-reservation-source"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { ReviewedCostOwner } from "./reviewed-cost-owners"
import type { readReviewedCostStockGraphs } from "./reviewed-cost-stock-graphs"
import { FinanceError } from "./rules"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Graph = Awaited<ReturnType<typeof readReviewedCostStockGraphs>>[number]
function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Complete original standalone reservation ownership changed.",
  )
}

/** Actual committed relations in one bounded batch; no source label or cost input. */
export async function readReviewedCostReservationSources(
  tx: Prisma.TransactionClient,
  input: {
    owners: ReviewedCostOwner[]
    graphs: Graph[]
    discovery: Discovery
    book: { id: string; tenantId: string; currencyCode: string }
  },
) {
  if (!input.owners.length) return []
  const ids = new Set(input.owners.map((owner) => owner.id))
  if (
    input.owners.length > 4096 ||
    ids.size !== input.owners.length ||
    input.book.id !== input.discovery.bookId ||
    input.book.tenantId !== input.discovery.tenantId ||
    input.book.currencyCode !== input.discovery.currencyCode ||
    input.owners.some(
      (owner) =>
        !owner.id.trim() ||
        !input.discovery.operationIds.includes(owner.id) ||
        owner.type !== "RESERVATION_COMMIT" ||
        !owner.committedReservation ||
        owner.committedReservation.commercialOrderLineId !== null,
    )
  )
    conflict()
  const reservations = await tx.stockReservation.findMany({
    where: { committedOperationId: { in: [...ids] } },
    include: reservationCommitSourceInclude.committedReservation.include,
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    reservations.length !== ids.size ||
    reservations.length > 4096 ||
    new Set(reservations.map((row) => row.id)).size !== reservations.length ||
    new Set(reservations.map((row) => row.committedOperationId)).size !==
      reservations.length ||
    reservations.some(
      (row) => !row.committedOperationId || !ids.has(row.committedOperationId),
    )
  )
    conflict()
  const byOperation = new Map(
    reservations.map((row) => [row.committedOperationId, row]),
  )
  const graphs = new Map(input.graphs.map((graph) => [graph.id, graph]))
  if (graphs.size !== input.graphs.length) conflict()
  return input.owners.map((owner) => {
    const graph = graphs.get(owner.id)
    const reservation = byOperation.get(owner.id)
    if (
      !graph ||
      !reservation ||
      reservation.id !== owner.committedReservation?.id
    )
      conflict()
    const { movements: _movementCount, ...sourceCounts } = graph._count
    return resolveLoadedReservationCommitSource(
      { ...graph, _count: sourceCounts, committedReservation: reservation },
      input.book.tenantId,
      input.book,
    )
  })
}
