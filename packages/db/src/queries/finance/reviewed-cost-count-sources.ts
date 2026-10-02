import type { Prisma } from "../../../generated/prisma/client"
import { resolveLoadedStockCountSource } from "./inventory-count-source"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { ReviewedCostOwner } from "./reviewed-cost-owners"
import type { readReviewedCostStockGraphs } from "./reviewed-cost-stock-graphs"
import { FinanceError } from "./rules"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Graph = Awaited<ReturnType<typeof readReviewedCostStockGraphs>>[number]
const storeSelect = { id: true, tenantId: true, currencyCode: true } as const
function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Complete original Stock Count ownership or line coverage changed.",
  )
}

/** Batched complete documents, including zero lines; supported writers serialize on Book. */
export async function readReviewedCostCountSources(
  tx: Prisma.TransactionClient,
  input: {
    owners: ReviewedCostOwner[]
    graphs: Graph[]
    discovery: Discovery
    book: { id: string; tenantId: string; currencyCode: string }
  },
) {
  if (!input.owners.length) return []
  const counts = await tx.stockCount.findMany({
    where: { finalizedOperationId: { in: input.owners.map((op) => op.id) } },
    include: {
      store: { select: storeSelect },
      _count: { select: { lines: true } },
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const documents = input.discovery.sourceDocumentReferences ?? []
  const countIds = new Set(
    documents.filter((row) => row.kind === "COUNT").map((row) => row.id),
  )
  const lineIds = new Set(
    documents.filter((row) => row.kind === "COUNT_LINE").map((row) => row.id),
  )
  if (
    counts.length !== input.owners.length ||
    counts.length > 4096 ||
    new Set(counts.map((count) => count.finalizedOperationId)).size !==
      counts.length ||
    counts.some((count) => !countIds.has(count.id)) ||
    counts.reduce((n, count) => n + count._count.lines, 0) > 32768
  )
    conflict()
  const lines = await tx.stockCountLine.findMany({
    where: { stockCountId: { in: counts.map((count) => count.id) } },
    include: {
      balanceSource: {
        include: { store: { select: storeSelect }, inventoryUnit: true },
      },
    },
    orderBy: { id: "asc" },
    take: 32769,
  })
  if (
    lines.length !== counts.reduce((n, count) => n + count._count.lines, 0) ||
    lines.length > 32768 ||
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    lines.some((line) => !lineIds.has(line.id))
  )
    conflict()
  const linesByCount = new Map<string, typeof lines>()
  for (const line of lines) {
    const group = linesByCount.get(line.stockCountId) ?? []
    group.push(line)
    linesByCount.set(line.stockCountId, group)
  }
  const graphs = new Map(input.graphs.map((op) => [op.id, op]))
  return counts.map((count) => {
    const operation = count.finalizedOperationId
      ? graphs.get(count.finalizedOperationId)
      : undefined
    const originalLines = linesByCount.get(count.id) ?? []
    if (!operation || originalLines.length !== count._count.lines) conflict()
    return resolveLoadedStockCountSource(
      { ...count, lines: originalLines, finalizedOperation: operation },
      input.book.tenantId,
      input.book,
    )
  })
}
