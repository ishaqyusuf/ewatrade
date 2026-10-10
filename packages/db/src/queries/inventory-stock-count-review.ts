import { subtractExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"

/** Retained observations and current state; reading never rebases a count. */
export async function getStockCountReview(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; stockCountId: string },
) {
  const count = await db.stockCount.findFirst({
    where: {
      id: input.stockCountId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    include: {
      lines: {
        orderBy: { id: "asc" },
        include: {
          balanceSource: {
            include: {
              inventoryUnit: { include: { configurationVersion: true } },
              product: { include: { catalogItem: true } },
              variant: true,
            },
          },
          entries: {
            orderBy: { id: "asc" },
            include: { enteredInventoryUnit: true },
          },
        },
      },
    },
  })
  if (!count)
    throw new CatalogError(
      "STOCK_COUNT_NOT_FOUND",
      "Stock Count not found for this business and Store.",
    )
  const lines = count.lines.map((line) => {
    const balance = line.balanceSource
    if (
      balance.tenantId !== input.tenantId ||
      balance.storeId !== input.storeId
    )
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Count sources must belong to this business and Store.",
      )
    const configurationCurrent =
      balance.inventoryUnit.configurationVersion.status === "CURRENT" &&
      balance.inventoryUnit.configurationVersionId ===
        line.configurationVersionId
    const stockCurrent = balance.revision === line.expectedRevision
    return {
      id: line.id,
      balanceSourceId: balance.id,
      catalogItemId: balance.product.catalogItemId,
      productName: balance.product.catalogItem.name,
      variantName: balance.variant.name,
      unitName: balance.inventoryUnit.name,
      custodyType: balance.custodyType,
      custodyReferenceId: balance.custodyReferenceId,
      configurationVersionId: line.configurationVersionId,
      configurationCurrent,
      expectedRevision: line.expectedRevision,
      currentRevision: balance.revision,
      stockCurrent,
      expectedQuantity: line.expectedQuantity.toFixed(),
      observedQuantity: line.observedQuantity.toFixed(),
      varianceQuantity: line.varianceQuantity.toFixed(),
      currentQuantity: balance.onHandQuantity.toFixed(),
      reservedQuantity: balance.reservedQuantity.toFixed(),
      availableAfter: subtractExactDecimals(
        line.observedQuantity.toFixed(),
        balance.reservedQuantity.toFixed(),
      ),
      entries: line.entries.map((entry) => ({
        enteredInventoryUnitId: entry.enteredInventoryUnitId,
        unitName: entry.enteredInventoryUnit.name,
        enteredQuantity: entry.enteredQuantity.toFixed(),
        factor: entry.unitFactorSnapshot.toFixed(),
        canonicalQuantity: entry.canonicalQuantity.toFixed(),
      })),
    }
  })
  return {
    id: count.id,
    storeId: count.storeId,
    status: count.status,
    reason: count.reason,
    createdAt: count.createdAt.toISOString(),
    finalizedAt: count.finalizedAt?.toISOString() ?? null,
    finalizedOperationId: count.finalizedOperationId,
    lines,
    canFinalize:
      count.status === "DRAFT" &&
      lines.length > 0 &&
      lines.every((line) => line.stockCurrent && line.configurationCurrent),
  }
}
