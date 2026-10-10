import {
  EXACT_QUANTITY_MAX_SCALE,
  compareExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { getConfiguredCatalogOfferingAvailability } from "./catalog-inventory"

/** A bounded live scan, not an aggregate or a stock-policy/reorder recommendation. */
export async function listCatalogLowStockPage(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    threshold: string
    afterOfferingId?: string
    catalogItemId?: string
    limit?: number
  },
) {
  const threshold = parseExactDecimal(input.threshold, {
    maxScale: EXACT_QUANTITY_MAX_SCALE,
  })
  const limit = input.limit ?? 10
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error("Low-stock page size must be between 1 and 20.")

  const candidates = await db.sellableOffering.findMany({
    where: {
      tenantId: input.tenantId,
      status: "ACTIVE",
      ...(input.afterOfferingId ? { id: { gt: input.afterOfferingId } } : {}),
      ...(input.catalogItemId ? { catalogItemId: input.catalogItemId } : {}),
      catalogItem: {
        tenantId: input.tenantId,
        kind: "PRODUCT",
        status: "ACTIVE",
      },
      variant: { status: "ACTIVE" },
      productUnitOffering: { isNot: null },
      storeAvailability: {
        some: { storeId: input.storeId, isAvailable: true },
      },
    },
    select: {
      id: true,
      name: true,
      catalogItem: { select: { id: true, name: true } },
      variant: { select: { name: true } },
      productUnitOffering: {
        select: { inventoryUnit: { select: { name: true } } },
      },
    },
    orderBy: { id: "asc" },
    take: limit + 1,
  })
  const page = candidates.slice(0, limit)
  const observations = await Promise.all(
    page.map(async (offering) => {
      if (!offering.productUnitOffering)
        throw new Error("Product offering has no inventory unit.")
      const identity = {
        offeringId: offering.id,
        offeringName: offering.name,
        catalogItemId: offering.catalogItem.id,
        productName: offering.catalogItem.name,
        variantName: offering.variant.name,
        unitName: offering.productUnitOffering.inventoryUnit.name,
      }
      try {
        const availability = await getConfiguredCatalogOfferingAvailability(
          db,
          {
            offeringId: offering.id,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        )
        return {
          ...identity,
          status: "available" as const,
          ...availability,
          low:
            compareExactDecimals(
              availability.availableOfferingQuantity,
              threshold,
            ) <= 0,
        }
      } catch (error) {
        if (
          !(error instanceof CatalogError) ||
          ![
            "OFFERING_UNAVAILABLE",
            "STALE_CONFIGURATION",
            "INVALID_UNIT_CONFIGURATION",
          ].includes(error.code)
        )
          throw error
        return {
          ...identity,
          status: "unavailable" as const,
          reason: error.message,
        }
      }
    }),
  )
  // Advance using scanned candidates, even when no candidate meets the threshold.
  const hasMore = candidates.length > limit
  return {
    threshold,
    thresholdBasis: "each_offering_unit" as const,
    scannedCount: page.length,
    lowStock: observations.filter(
      (row) => row.status === "available" && row.low,
    ),
    unavailable: observations.filter((row) => row.status === "unavailable"),
    hasMore,
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  }
}
