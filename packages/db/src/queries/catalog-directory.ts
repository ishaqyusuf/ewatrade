import { rankBySearch } from "@ewatrade/utils/search-rank"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogRecordStatus } from "../../generated/prisma/enums"
import type { ListCatalogItemsPageInput } from "./catalog"
import {
  RANKED_SEARCH_CANDIDATES,
  RANK_CURSOR,
  catalogListPageQuery,
  catalogSearchFields,
} from "./catalog-list-query"
import {
  catalogKindValue,
  catalogStatusValue,
  pricingPolicyValue,
} from "./catalog-read"

type DirectoryInput = ListCatalogItemsPageInput & { storeId: string }
const live = { status: { not: CatalogRecordStatus.ARCHIVED } }

export function catalogDirectorySelect(
  input: Pick<DirectoryInput, "storeId" | "storeIds">,
) {
  return {
    id: true,
    name: true,
    kind: true,
    status: true,
    _count: { select: { variants: { where: live } } },
    variants: {
      where: live,
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      take: 1,
      select: {
        name: true,
        _count: { select: { offerings: { where: live } } },
        offerings: {
          where: live,
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            name: true,
            fixedPriceMinor: true,
            currencyCode: true,
            pricingPolicy: true,
          },
        },
      },
    },
    product: {
      select: {
        id: true,
        usage: true,
        stockBalanceSources: {
          where: input.storeIds
            ? { storeId: { in: input.storeIds } }
            : undefined,
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            onHandQuantity: true,
            inventoryUnit: { select: { name: true } },
          },
        },
      },
    },
    illustrations: {
      where: { storeId: input.storeId },
      orderBy: { storeId: "asc" },
      take: 1,
      select: { storeId: true, illustrationId: true },
    },
    photoAssets: {
      where: {
        storeId: input.storeId,
        optionVariantId: null,
        state: { in: ["PENDING_REVIEW", "APPROVED"] },
      },
      orderBy: { sortOrder: "asc" },
      take: 1,
      select: { id: true, storeId: true },
    },
  } satisfies Prisma.CatalogItemSelect
}

type DirectoryRecord = Prisma.CatalogItemGetPayload<{
  select: ReturnType<typeof catalogDirectorySelect>
}>

export function serializeCatalogDirectoryItem(item: DirectoryRecord) {
  const variant = item.variants[0]
  const offering = variant?.offerings[0]
  return {
    id: item.id,
    name: item.name,
    kind: catalogKindValue(item.kind),
    status: catalogStatusValue(item.status),
    variantCount: item._count.variants,
    primaryVariantName: variant?.name ?? null,
    offeringCount: variant?._count.offerings ?? 0,
    primaryOffering: offering
      ? {
          name: offering.name,
          fixedPriceMinor: offering.fixedPriceMinor,
          currencyCode: offering.currencyCode,
          pricingPolicy: pricingPolicyValue(offering.pricingPolicy),
        }
      : null,
    product: item.product
      ? {
          id: item.product.id,
          usage: item.product.usage,
          stockBalances: item.product.stockBalanceSources.map((balance) => ({
            onHandQuantity: balance.onHandQuantity.toString(),
            inventoryUnitName: balance.inventoryUnit.name,
          })),
        }
      : null,
    illustrations: item.illustrations,
    photos: item.photoAssets.map((photo) => ({
      assetId: photo.id,
      storeId: photo.storeId,
    })),
  }
}

const searchCandidateSelect = {
  id: true,
  name: true,
  kind: true,
  category: true,
  description: true,
  variants: {
    orderBy: { sortOrder: "asc" },
    select: {
      name: true,
      offerings: { orderBy: { sortOrder: "asc" }, select: { name: true } },
    },
  },
  product: {
    select: {
      currentUnitConfiguration: {
        select: {
          units: { orderBy: { sortOrder: "asc" }, select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.CatalogItemSelect

export async function listCatalogDirectoryPage(
  db: Pick<PrismaClient, "catalogItem">,
  input: DirectoryInput,
) {
  const plan = await catalogListPageQuery(db, input)
  const select = catalogDirectorySelect(input)
  if (!plan.ranked) {
    const records = await db.catalogItem.findMany({
      select,
      where: plan.where,
      orderBy: plan.orderBy,
      take: plan.limit + 1,
    })
    const more = records.length > plan.limit
    const page = more ? records.slice(0, plan.limit) : records
    return {
      items: page.map(serializeCatalogDirectoryItem),
      nextCursor: more ? page.at(-1)?.id : undefined,
    }
  }

  const candidates = await db.catalogItem.findMany({
    select: searchCandidateSelect,
    where: plan.where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: RANKED_SEARCH_CANDIDATES,
  })
  const offset = input.cursor?.startsWith(RANK_CURSOR)
    ? Math.max(Number(input.cursor.slice(RANK_CURSOR.length)) || 0, 0)
    : 0
  const ranked = rankBySearch(
    candidates,
    input.query ?? "",
    catalogSearchFields,
  )
  const ids = ranked.slice(offset, offset + plan.limit).map((item) => item.id)
  const records = ids.length
    ? await db.catalogItem.findMany({
        select,
        where: { AND: [plan.where, { id: { in: ids } }] },
        take: plan.limit,
      })
    : []
  const rows = new Map(
    records.map((item) => [item.id, serializeCatalogDirectoryItem(item)]),
  )
  return {
    items: ids.flatMap((id) => {
      const item = rows.get(id)
      return item ? [item] : []
    }),
    nextCursor:
      offset + plan.limit < ranked.length
        ? `${RANK_CURSOR}${offset + plan.limit}`
        : undefined,
  }
}
