import type { Prisma } from "../../../generated/prisma/client"
import {
  type InventoryCloseoutSourceGraph,
  closeoutSourceInclude,
  resolveLoadedInventoryCloseoutSource,
} from "./inventory-closeout-source"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { ReviewedCostOwner } from "./reviewed-cost-owners"
import type { readReviewedCostStockGraphs } from "./reviewed-cost-stock-graphs"
import { FinanceError } from "./rules"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Graph = Awaited<ReturnType<typeof readReviewedCostStockGraphs>>[number]
type Balance = InventoryCloseoutSourceGraph["lines"][number]["balanceSource"]
function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Complete original Closeout ownership or line coverage changed.",
  )
}

/** Complete documents under held Book; reuse stock metadata and batch missing zero siblings. */
export async function readReviewedCostCloseoutSources(
  tx: Prisma.TransactionClient,
  input: {
    owners: ReviewedCostOwner[]
    graphs: Graph[]
    discovery: Discovery
    book: { id: string; tenantId: string; currencyCode: string }
  },
) {
  if (!input.owners.length) return []
  const ownerIds = new Set(input.owners.map((op) => op.id))
  if (
    input.owners.length > 4096 ||
    ownerIds.size !== input.owners.length ||
    input.owners.some(
      (op) => !op.id.trim() || !input.discovery.operationIds.includes(op.id),
    ) ||
    input.book.id !== input.discovery.bookId ||
    input.book.tenantId !== input.discovery.tenantId ||
    input.book.currencyCode !== input.discovery.currencyCode
  )
    conflict()
  const closeouts = await tx.inventoryCloseout.findMany({
    where: { finalizedOperationId: { in: input.owners.map((op) => op.id) } },
    include: {
      store: closeoutSourceInclude.store,
      _count: { select: { lines: true } },
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const documents = input.discovery.sourceDocumentReferences ?? []
  const closeoutIds = new Set(
    documents.filter((row) => row.kind === "CLOSEOUT").map((row) => row.id),
  )
  const lineIds = new Set(
    documents
      .filter((row) => row.kind === "CLOSEOUT_LINE")
      .map((row) => row.id),
  )
  const expectedLines = closeouts.reduce(
    (n, closeout) => n + closeout._count.lines,
    0,
  )
  if (
    closeouts.length !== input.owners.length ||
    closeouts.length > 4096 ||
    new Set(closeouts.map((closeout) => closeout.finalizedOperationId)).size !==
      closeouts.length ||
    new Set(closeouts.map((closeout) => closeout.id)).size !==
      closeouts.length ||
    closeouts.some(
      (closeout) =>
        !closeoutIds.has(closeout.id) ||
        !closeout.finalizedOperationId ||
        !ownerIds.has(closeout.finalizedOperationId) ||
        !Number.isSafeInteger(closeout._count.lines) ||
        closeout._count.lines < 0,
    ) ||
    expectedLines > 32768
  )
    conflict()
  const lines = await tx.inventoryCloseoutLine.findMany({
    where: { closeoutId: { in: closeouts.map((closeout) => closeout.id) } },
    orderBy: { id: "asc" },
    take: 32769,
  })
  if (
    lines.length !== expectedLines ||
    lines.length > 32768 ||
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    lines.some((line) => !lineIds.has(line.id))
  )
    conflict()
  const graphs = new Map(
    input.graphs.map((operation) => [operation.id, operation]),
  )
  if (graphs.size !== input.graphs.length) conflict()
  const balances = new Map<string, Balance>()
  for (const graph of input.graphs)
    for (const movement of graph.movements)
      balances.set(movement.balanceSourceId, movement.balanceSource)
  const missingIds = [
    ...new Set(
      lines
        .map((line) => line.balanceSourceId)
        .filter((id) => !balances.has(id)),
    ),
  ]
  if (missingIds.length) {
    const missing = await tx.stockBalanceSource.findMany({
      where: { id: { in: missingIds } },
      include: closeoutSourceInclude.lines.include.balanceSource.include,
      orderBy: { id: "asc" },
      take: missingIds.length + 1,
    })
    const expected = new Set(missingIds)
    if (
      missing.length !== expected.size ||
      new Set(missing.map((row) => row.id)).size !== missing.length ||
      missing.some((row) => !expected.has(row.id))
    )
      conflict()
    for (const balance of missing) balances.set(balance.id, balance)
  }
  const linesByCloseout = new Map<string, typeof lines>()
  for (const line of lines) {
    const group = linesByCloseout.get(line.closeoutId) ?? []
    group.push(line)
    linesByCloseout.set(line.closeoutId, group)
  }
  return closeouts.map((closeout) => {
    const operation = closeout.finalizedOperationId
      ? graphs.get(closeout.finalizedOperationId)
      : undefined
    const originalLines = linesByCloseout.get(closeout.id) ?? []
    if (!operation || originalLines.length !== closeout._count.lines) conflict()
    // Physical movement count is not a competing owning document.
    const { movements: _movementCount, ...sourceCounts } = operation._count
    const source = resolveLoadedInventoryCloseoutSource(
      {
        ...closeout,
        finalizedOperation: { ...operation, _count: sourceCounts },
        lines: originalLines.map((line) => {
          const balanceSource = balances.get(line.balanceSourceId)
          if (!balanceSource) conflict()
          return { ...line, balanceSource }
        }),
      },
      input.book.tenantId,
    )
    if (source.closeout.store.currencyCode !== input.book.currencyCode)
      conflict()
    return { ...source, book: input.book }
  })
}
