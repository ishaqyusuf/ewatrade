import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  readSavedPackagedTransformationSource,
  resolveLoadedPackagedTransformationSource,
} from "./inventory-transformation-source"
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
    "Original packaged transformation ownership or scope changed.",
  )
}

/** Prove actual flat-loaded pairs under the held Book; no per-operation reads. */
export function proveReviewedCostTransformationSources(input: {
  graphs: Graph[]
  discovery: Discovery
  book: { id: string; tenantId: string; currencyCode: string }
}) {
  if (!input.graphs.length) return []
  if (
    input.graphs.length > 2048 ||
    new Set(input.graphs.map((g) => g.id)).size !== input.graphs.length ||
    input.book.id !== input.discovery.bookId ||
    input.book.tenantId !== input.discovery.tenantId ||
    input.book.currencyCode !== input.discovery.currencyCode
  )
    conflict()
  return input.graphs.map((graph) => {
    if (
      graph.type !== "TRANSFORMATION" ||
      !input.discovery.operationIds.includes(graph.id) ||
      graph.correctionOfOperationId !== null ||
      graph.committedReservation !== null ||
      graph._count.movements !== 2 ||
      graph._count.corrections !== 0 ||
      Object.entries(graph._count).some(
        ([key, count]) => key !== "movements" && count !== 0,
      ) ||
      !graph.actorUserId.trim() ||
      !Number.isFinite(graph.effectiveAt.getTime())
    )
      conflict()
    const source = resolveLoadedPackagedTransformationSource(
      graph,
      input.book.tenantId,
      input.book,
    )
    for (const movement of [source.sourceMovement, source.targetMovement]) {
      const original = graph.movements.find((m) => m.id === movement.id)
      if (!original) conflict()
      const balance = original.balanceSource
      const unit = original.enteredInventoryUnit
      if (
        !input.discovery.movementIds.includes(original.id) ||
        !input.discovery.balanceSourceIds.includes(balance.id) ||
        balance.store.id !== balance.storeId ||
        balance.product.id !== balance.productId ||
        balance.product.catalogItemId !== balance.product.catalogItem.id ||
        balance.product.catalogItem.tenantId !== input.book.tenantId ||
        balance.variant.id !== balance.variantId ||
        balance.variant.catalogItemId !== balance.product.catalogItemId ||
        balance.inventoryUnit.id !== balance.inventoryUnitId ||
        balance.inventoryUnit.configurationVersion.id !==
          balance.inventoryUnit.configurationVersionId ||
        balance.inventoryUnit.configurationVersion.productId !==
          balance.productId ||
        unit.id !== original.enteredInventoryUnitId ||
        unit.configurationVersionId !== original.configurationVersionId ||
        unit.configurationVersion.id !== unit.configurationVersionId ||
        unit.configurationVersion.productId !== balance.productId ||
        unit.stockBehavior !== "PACKAGED_STOCK" ||
        unit.factor.toFixed() !== original.unitFactorSnapshot.toFixed() ||
        unit.transactionScale !== original.transactionScaleSnapshot ||
        !Number.isSafeInteger(unit.transactionScale) ||
        unit.transactionScale < 0 ||
        unit.transactionScale > 18 ||
        original.purchaseReceipt !== null
      )
        conflict()
      try {
        parseExactDecimal(original.enteredQuantity.toFixed(), {
          allowZero: false,
          maxScale: unit.transactionScale,
        })
      } catch {
        conflict()
      }
      const event = original.valuationEvent
      if (
        event &&
        (event.pool.id !== event.poolId ||
          event.pool.tenantId !== input.book.tenantId ||
          event.pool.bookId !== input.book.id ||
          event.pool.balanceSourceId !== balance.id)
      )
        conflict()
    }
    // Partial pairs refuse; two absent events remain a supported-source blocker.
    const saved = readSavedPackagedTransformationSource(source)
    return { ...source, saved }
  })
}
