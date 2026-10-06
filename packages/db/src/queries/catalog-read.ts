import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  OfferingPricingPolicy,
  SellableOfferingKind,
  StockBalanceKind,
} from "../../generated/prisma/enums"

export type CatalogItemKindValue = "product" | "service"
export type CatalogItemStatusValue = "active" | "archived" | "draft"
export type OfferingPricingPolicyValue =
  | "fixed"
  | "quote_required"
  | "order_total"
export type InventoryUnitStockBehaviorValue =
  | "alternate_transaction"
  | "canonical_shared"
  | "packaged_stock"

export const catalogItemGraph = {
  optionGroups: {
    include: {
      values: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  },
  product: {
    include: {
      currentUnitConfiguration: {
        include: {
          units: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      stockBalanceSources: {
        include: {
          inventoryUnit: true,
          variant: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  },
  service: true,
  illustrations: {
    select: { storeId: true, illustrationId: true },
    orderBy: { storeId: "asc" },
  },
  photoAssets: {
    where: { state: { in: ["PENDING_REVIEW", "APPROVED"] } },
    select: { id: true, storeId: true, state: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  },
  variants: {
    include: {
      offerings: {
        include: {
          productUnitOffering: {
            include: {
              inventoryUnit: true,
            },
          },
          serviceOffering: true,
          storeAvailability: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      selections: {
        include: {
          group: true,
          value: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.CatalogItemInclude

export function catalogItemGraphForStores(storeIds?: string[]) {
  if (!storeIds) return catalogItemGraph
  const where = { storeId: { in: storeIds } }
  return {
    ...catalogItemGraph,
    product: {
      include: {
        ...catalogItemGraph.product.include,
        stockBalanceSources: {
          ...catalogItemGraph.product.include.stockBalanceSources,
          where,
        },
      },
    },
    illustrations: { ...catalogItemGraph.illustrations, where },
    photoAssets: {
      ...catalogItemGraph.photoAssets,
      where: { ...catalogItemGraph.photoAssets.where, ...where },
    },
    variants: {
      ...catalogItemGraph.variants,
      include: {
        ...catalogItemGraph.variants.include,
        offerings: {
          ...catalogItemGraph.variants.include.offerings,
          include: {
            ...catalogItemGraph.variants.include.offerings.include,
            storeAvailability: { where },
          },
        },
      },
    },
  }
}

export type CatalogItemGraph = Prisma.CatalogItemGetPayload<{
  include: typeof catalogItemGraph
}>

function catalogKindValue(kind: CatalogItemKind): CatalogItemKindValue {
  return kind === CatalogItemKind.PRODUCT ? "product" : "service"
}

function catalogStatusValue(
  status: CatalogRecordStatus,
): CatalogItemStatusValue {
  if (status === CatalogRecordStatus.ACTIVE) return "active"
  if (status === CatalogRecordStatus.ARCHIVED) return "archived"
  return "draft"
}

function pricingPolicyValue(
  policy: OfferingPricingPolicy,
): OfferingPricingPolicyValue {
  if (policy === OfferingPricingPolicy.ORDER_TOTAL) return "order_total"
  return policy === OfferingPricingPolicy.FIXED ? "fixed" : "quote_required"
}

function stockBehaviorValue(
  behavior: InventoryUnitStockBehavior,
): InventoryUnitStockBehaviorValue {
  if (behavior === InventoryUnitStockBehavior.CANONICAL_SHARED) {
    return "canonical_shared"
  }
  if (behavior === InventoryUnitStockBehavior.ALTERNATE_TRANSACTION) {
    return "alternate_transaction"
  }
  return "packaged_stock"
}

export function serializeCatalogItem(item: CatalogItemGraph) {
  return {
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    category: item.category,
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
    illustrations: item.illustrations ?? [],
    photos: (item.photoAssets ?? []).map((photo) => ({
      assetId: photo.id,
      storeId: photo.storeId,
      state: photo.state,
      sortOrder: photo.sortOrder,
    })),
    description: item.description,
    id: item.id,
    imageLinks: item.imageLinks,
    imageUrl: item.imageUrl,
    kind: catalogKindValue(item.kind),
    name: item.name,
    optionGroups: item.optionGroups.map((group) => ({
      id: group.id,
      key: group.key,
      name: group.name,
      values: group.values.map((value) => ({
        id: value.id,
        key: value.key,
        label: value.label,
      })),
    })),
    product: item.product
      ? {
          id: item.product.id,
          currentUnitConfiguration: item.product.currentUnitConfiguration
            ? {
                canonicalBalanceScale:
                  item.product.currentUnitConfiguration.canonicalBalanceScale,
                id: item.product.currentUnitConfiguration.id,
                units: item.product.currentUnitConfiguration.units.map(
                  (unit) => ({
                    factor: unit.factor.toString(),
                    id: unit.id,
                    key: unit.key,
                    name: unit.name,
                    stockBehavior: stockBehaviorValue(unit.stockBehavior),
                    symbol: unit.symbol,
                    transactionScale: unit.transactionScale,
                  }),
                ),
                version: item.product.currentUnitConfiguration.version,
              }
            : null,
          stockBalances: item.product.stockBalanceSources.map((balance) => ({
            id: balance.id,
            inventoryUnitId: balance.inventoryUnitId,
            inventoryUnitName: balance.inventoryUnit.name,
            kind:
              balance.kind === StockBalanceKind.SHARED_POOL
                ? "shared_pool"
                : "packaged_stock",
            onHandQuantity: balance.onHandQuantity.toString(),
            reservedQuantity: balance.reservedQuantity.toString(),
            revision: balance.revision,
            storeId: balance.storeId,
            variantId: balance.variantId,
            variantName: balance.variant.name,
          })),
        }
      : null,
    service: item.service ? { id: item.service.id } : null,
    slug: item.slug,
    status: catalogStatusValue(item.status),
    variants: item.variants.map((variant) => ({
      description: variant.description,
      id: variant.id,
      imageUrl: variant.imageUrl,
      isDefault: variant.isDefault,
      key: variant.key,
      name: variant.name,
      offerings: variant.offerings.map((offering) => ({
        currencyCode: offering.currencyCode,
        fixedPriceMinor: offering.fixedPriceMinor,
        id: offering.id,
        key: offering.key,
        kind:
          offering.kind === SellableOfferingKind.PRODUCT_UNIT
            ? "product_unit"
            : "service",
        name: offering.name,
        pricingPolicy: pricingPolicyValue(offering.pricingPolicy),
        productUnit: offering.productUnitOffering
          ? {
              barcode: offering.productUnitOffering.barcode,
              inventoryUnitId: offering.productUnitOffering.inventoryUnit.id,
              sku: offering.productUnitOffering.sku,
            }
          : null,
        service: offering.serviceOffering
          ? { id: offering.serviceOffering.id }
          : null,
        serviceWorkPolicy: offering.serviceOffering
          ? {
              authorizationPolicy: offering.serviceOffering.authorizationPolicy,
              guidance: offering.serviceOffering.guidance,
              quantityScale: offering.serviceOffering.quantityScale,
              workPolicy: offering.serviceOffering.workPolicy,
            }
          : null,
        status: catalogStatusValue(offering.status),
        stores: offering.storeAvailability.map((availability) => ({
          isAvailable: availability.isAvailable,
          storeId: availability.storeId,
        })),
      })),
      selections: variant.selections.map((selection) => ({
        groupId: selection.groupId,
        groupKey: selection.group.key,
        valueId: selection.valueId,
        valueKey: selection.value.key,
      })),
      status: catalogStatusValue(variant.status),
    })),
  }
}

export async function getCatalogItem(
  db: PrismaClient,
  input: { itemId: string; tenantId: string; storeIds?: string[] },
) {
  const item = await db.catalogItem.findFirst({
    include: catalogItemGraphForStores(input.storeIds),
    where: { id: input.itemId, tenantId: input.tenantId },
  })

  return item ? serializeCatalogItem(item) : null
}
