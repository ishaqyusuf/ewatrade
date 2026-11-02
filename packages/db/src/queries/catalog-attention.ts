import {
  type CatalogAttention,
  type CatalogAttentionItem,
  catalogItemAttention,
} from "@ewatrade/utils/catalog-attention"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  InventoryUnitStockBehavior,
  StockBalanceKind,
} from "../../generated/prisma/enums"
import { catalogKind, catalogStatus, pricingPolicyValue } from "./catalog-read"
import type {
  CatalogItemKindValue,
  CatalogItemStatusValue,
} from "./catalog-read"

/** Items read per batch while classifying the whole Catalog. */
const ATTENTION_SCAN_BATCH = 500

/** Only what the attention rule reads, with stock limited to one Store. */
function attentionSelect(storeId: string) {
  return {
    id: true,
    kind: true,
    product: {
      select: {
        currentUnitConfiguration: {
          select: {
            units: { select: { id: true, stockBehavior: true } },
          },
        },
        stockBalanceSources: {
          where: { storeId },
          select: {
            inventoryUnitId: true,
            kind: true,
            onHandQuantity: true,
            reservedQuantity: true,
            storeId: true,
            variantId: true,
          },
        },
      },
    },
    variants: {
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        isDefault: true,
        offerings: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            fixedPriceMinor: true,
            pricingPolicy: true,
            productUnitOffering: { select: { inventoryUnitId: true } },
          },
        },
      },
    },
  } satisfies Prisma.CatalogItemSelect
}

type AttentionRecord = Prisma.CatalogItemGetPayload<{
  select: ReturnType<typeof attentionSelect>
}>

function toAttentionItem(record: AttentionRecord): CatalogAttentionItem {
  return {
    kind: record.kind === CatalogItemKind.PRODUCT ? "product" : "service",
    product: record.product
      ? {
          currentUnitConfiguration: record.product.currentUnitConfiguration
            ? {
                units: record.product.currentUnitConfiguration.units.map(
                  (unit) => ({
                    id: unit.id,
                    stockBehavior:
                      unit.stockBehavior ===
                      InventoryUnitStockBehavior.PACKAGED_STOCK
                        ? "packaged_stock"
                        : "other",
                  }),
                ),
              }
            : null,
          stockBalances: record.product.stockBalanceSources.map((balance) => ({
            inventoryUnitId: balance.inventoryUnitId,
            kind:
              balance.kind === StockBalanceKind.SHARED_POOL
                ? "shared_pool"
                : "packaged_stock",
            onHandQuantity: balance.onHandQuantity.toString(),
            reservedQuantity: balance.reservedQuantity.toString(),
            storeId: balance.storeId,
            variantId: balance.variantId,
          })),
        }
      : null,
    variants: record.variants.map((variant) => ({
      id: variant.id,
      isDefault: variant.isDefault,
      offerings: variant.offerings.map((offering) => ({
        fixedPriceMinor: offering.fixedPriceMinor,
        pricingPolicy: pricingPolicyValue(offering.pricingPolicy),
        productUnit: offering.productUnitOffering
          ? { inventoryUnitId: offering.productUnitOffering.inventoryUnitId }
          : null,
      })),
    })),
  }
}

/**
 * Walks every matching Catalog item in id order and classifies it for one
 * Store, so counts and filters never depend on which pages a phone loaded.
 */
async function scanCatalogAttention(
  db: Pick<PrismaClient, "catalogItem">,
  input: { storeId: string; where: Prisma.CatalogItemWhereInput },
  visit: (
    item: { id: string; kind: CatalogItemKindValue },
    attention: CatalogAttention | undefined,
  ) => void,
) {
  const select = attentionSelect(input.storeId)
  let cursor: string | undefined
  for (;;) {
    const records = await db.catalogItem.findMany({
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select,
      skip: cursor ? 1 : 0,
      take: ATTENTION_SCAN_BATCH,
      where: input.where,
    })
    for (const record of records) {
      const item = toAttentionItem(record)
      visit(
        { id: record.id, kind: item.kind },
        catalogItemAttention(item, input.storeId),
      )
    }
    if (records.length < ATTENTION_SCAN_BATCH) return
    cursor = records.at(-1)?.id
  }
}

function attentionWhere(input: {
  kind?: CatalogItemKindValue
  status?: CatalogItemStatusValue
  tenantId: string
}): Prisma.CatalogItemWhereInput {
  return {
    kind: input.kind ? catalogKind(input.kind) : undefined,
    status: input.status ? catalogStatus(input.status) : undefined,
    systemRole: null,
    tenantId: input.tenantId,
  }
}

/**
 * Exact Catalog counts for the type switch and problem chips, across every
 * item in the business with stock read for one Store.
 */
export async function getCatalogAttentionSummary(
  db: Pick<PrismaClient, "catalogItem">,
  input: {
    kind?: CatalogItemKindValue
    status?: CatalogItemStatusValue
    storeId: string
    tenantId: string
  },
) {
  const counts: Record<
    "all" | CatalogItemKindValue | CatalogAttention,
    number
  > = {
    all: 0,
    product: 0,
    service: 0,
    no_price: 0,
    not_counted: 0,
    out_of_stock: 0,
  }
  await scanCatalogAttention(
    db,
    { storeId: input.storeId, where: attentionWhere(input) },
    (item, attention) => {
      counts.all += 1
      counts[item.kind] += 1
      if (attention) counts[attention] += 1
    },
  )
  return { ...counts, storeId: input.storeId }
}

/** Ids of the items with one problem in a Store, for the filtered list. */
export async function listCatalogAttentionItemIds(
  db: Pick<PrismaClient, "catalogItem">,
  input: {
    attention: CatalogAttention
    kind?: CatalogItemKindValue
    status?: CatalogItemStatusValue
    storeId: string
    tenantId: string
  },
) {
  const ids: string[] = []
  await scanCatalogAttention(
    db,
    { storeId: input.storeId, where: attentionWhere(input) },
    (item, attention) => {
      if (attention === input.attention) ids.push(item.id)
    },
  )
  return ids
}
