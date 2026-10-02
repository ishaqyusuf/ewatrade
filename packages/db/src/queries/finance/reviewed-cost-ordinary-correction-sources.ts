import {
  readSavedOrdinaryCorrectionSource,
  resolveLoadedOrdinaryCorrectionSource,
} from "./inventory-ordinary-correction-source"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { readReviewedCostStockGraphs } from "./reviewed-cost-stock-graphs"
import { FinanceError } from "./rules"

type Graph = Awaited<ReturnType<typeof readReviewedCostStockGraphs>>[number]
type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Original ordinary correction source scope or ownership changed.",
  )
}

/** Prove complete actual inverse/replacement groups from the existing bounded flat read. */
export function proveReviewedOrdinaryCorrectionSources(input: {
  graphs: Graph[]
  correctionIds: string[]
  discovery: Discovery
  book: { id: string; tenantId: string; currencyCode: string }
}) {
  if (!input.correctionIds.length) return []
  if (
    input.graphs.length > 4096 ||
    new Set(input.graphs.map((g) => g.id)).size !== input.graphs.length ||
    input.correctionIds.length > 1365 ||
    new Set(input.correctionIds).size !== input.correctionIds.length ||
    input.book.id !== input.discovery.bookId ||
    input.book.tenantId !== input.discovery.tenantId ||
    input.book.currencyCode !== input.discovery.currencyCode
  )
    conflict()
  const byId = new Map(input.graphs.map((g) => [g.id, g]))
  const originals = new Set<string>()
  return input.correctionIds.map((id) => {
    const correction = byId.get(id)
    const original = correction?.correctionOfOperationId
      ? byId.get(correction.correctionOfOperationId)
      : null
    if (
      !correction ||
      !original ||
      originals.has(original.id) ||
      correction._count.movements !== 2 ||
      original._count.movements !== 1 ||
      correction._count.corrections !== 0
    )
      conflict()
    originals.add(original.id)
    for (const graph of [correction, original]) {
      if (
        !input.discovery.operationIds.includes(graph.id) ||
        !graph.actorUserId.trim()
      )
        conflict()
      for (const m of graph.movements) {
        const balance = m.balanceSource
        if (
          !input.discovery.movementIds.includes(m.id) ||
          !input.discovery.balanceSourceIds.includes(balance.id) ||
          balance.product.id !== balance.productId ||
          balance.product.catalogItemId !== balance.product.catalogItem.id ||
          balance.product.catalogItem.tenantId !== input.book.tenantId ||
          balance.variant.id !== balance.variantId ||
          balance.variant.catalogItemId !== balance.product.catalogItemId
        )
          conflict()
      }
    }
    const source = resolveLoadedOrdinaryCorrectionSource(
      { ...correction, correctionOf: original },
      input.book.tenantId,
      input.book,
    )
    const saved = readSavedOrdinaryCorrectionSource(source)
    return { ...source, saved }
  })
}
