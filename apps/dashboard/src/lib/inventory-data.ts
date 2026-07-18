import {
  type StockMovementRow,
  mapInventoryRows,
} from "@/lib/inventory-operations"
import { prisma } from "@ewatrade/db"
import { listRetailOpsStockMovements } from "@ewatrade/db/queries"

export async function getDashboardInventory(input: {
  limit?: number
  productVariantId?: string
  storeId: string
  tenantId: string
}) {
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      currencyCode: true,
      id: true,
      name: true,
      slug: true,
      status: true,
      variants: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          conversionRatioDenominator: true,
          conversionRatioNumerator: true,
          id: true,
          inventoryItem: {
            select: {
              onHandQuantity: true,
              reorderPoint: true,
              reservedQuantity: true,
            },
          },
          isDefault: true,
          metadata: true,
          name: true,
          priceMinor: true,
          sku: true,
        },
        where: {
          isActive: true,
        },
      },
    },
    take: 150,
    where: {
      kind: "PRODUCT",
      status: { not: "ARCHIVED" },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const movements = await listRetailOpsStockMovements(prisma, {
    limit: input.limit ?? 75,
    productVariantId: input.productVariantId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  return {
    inventory: mapInventoryRows(products),
    movements: movements as StockMovementRow[],
  }
}
