import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"

/**
 * The Product's "Running low" level, in its main unit: stock free to sell at
 * or below it shows as Running low. null removes the level. It is a display
 * setting only; it never blocks a sale or a stock change.
 */
export async function setCatalogProductLowStockLevel(
  db: PrismaClient,
  input: { tenantId: string; productId: string; level: string | null },
) {
  let level: string | null = null
  if (input.level !== null) {
    try {
      level = parseExactDecimal(input.level, {
        allowZero: true,
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      })
    } catch {
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        "Enter the low-stock level as 0 or more.",
      )
    }
  }
  const updated = await db.catalogProduct.updateMany({
    where: {
      id: input.productId,
      catalogItem: { tenantId: input.tenantId, kind: "PRODUCT" },
    },
    data: { lowStockLevel: level },
  })
  if (updated.count !== 1)
    throw new CatalogError("CATALOG_ITEM_NOT_FOUND", "Product not found.")
  return { productId: input.productId, lowStockLevel: level }
}
