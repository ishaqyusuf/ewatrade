import {
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"

/** One Store's loose stock lines; past this the read says it is partial. */
const RUNNING_LOW_SCAN_LIMIT = 500
/** Products without a saved level: how many of the least-stocked to name. */
const FEWEST_LEFT = 5

type RunningLowRow = {
  catalogItemId: string
  productName: string
  variantName: string
  unitName: string
  availableQuantity: string
  lowStockLevel: string | null
  out: boolean
}

/** Out of stock first, then the least left. */
function byLeastLeft(a: RunningLowRow, b: RunningLowRow) {
  return (
    Number(b.out) - Number(a.out) ||
    compareExactDecimals(a.availableQuantity, b.availableQuantity) ||
    a.productName.localeCompare(b.productName)
  )
}

/**
 * Stock at or below each Product's saved low-stock level in one Store, the
 * dashboard's "Running low" rule: loose stock kept in the Store (not packs
 * kept separately, on the way or with staff), free to sell after
 * reservations. Products without a saved level are never judged low; only
 * those that are out of stock and the few with the least left are named.
 */
export async function listCatalogRunningLow(
  db: PrismaClient | Prisma.TransactionClient,
  input: { tenantId: string; storeId: string },
) {
  const product = {
    catalogItem: {
      tenantId: input.tenantId,
      kind: "PRODUCT",
      status: "ACTIVE",
      systemRole: null,
    },
  } satisfies Prisma.CatalogProductWhereInput
  const [sources, levelsSet, levelsMissing] = await Promise.all([
    db.stockBalanceSource.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        custodyType: "STORE",
        kind: "SHARED_POOL",
        product,
      },
      select: {
        id: true,
        onHandQuantity: true,
        reservedQuantity: true,
        inventoryUnit: { select: { name: true } },
        variant: { select: { name: true } },
        product: {
          select: {
            lowStockLevel: true,
            catalogItem: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: RUNNING_LOW_SCAN_LIMIT + 1,
    }),
    db.catalogProduct.count({
      where: { ...product, lowStockLevel: { not: null } },
    }),
    db.catalogProduct.count({ where: { ...product, lowStockLevel: null } }),
  ])
  const partial = sources.length > RUNNING_LOW_SCAN_LIMIT
  const rows: RunningLowRow[] = sources
    .slice(0, RUNNING_LOW_SCAN_LIMIT)
    .map((source) => {
      const availableQuantity = subtractExactDecimals(
        source.onHandQuantity.toFixed(),
        source.reservedQuantity.toFixed(),
      )
      return {
        catalogItemId: source.product.catalogItem.id,
        productName: source.product.catalogItem.name,
        variantName: source.variant.name,
        unitName: source.inventoryUnit.name,
        availableQuantity,
        lowStockLevel: source.product.lowStockLevel?.toFixed() ?? null,
        out: compareExactDecimals(availableQuantity, "0") <= 0,
      }
    })
  const unset = rows
    .filter((row) => row.lowStockLevel == null)
    .sort(byLeastLeft)
  return {
    items: rows
      .filter(
        (row) =>
          row.lowStockLevel != null &&
          compareExactDecimals(row.availableQuantity, row.lowStockLevel) <= 0,
      )
      .sort(byLeastLeft),
    withoutLevel: {
      out: unset.filter((row) => row.out),
      fewestLeft: unset.filter((row) => !row.out).slice(0, FEWEST_LEFT),
    },
    levelsSet,
    levelsMissing,
    partial,
  }
}
