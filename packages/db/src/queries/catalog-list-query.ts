import {
  type SearchField,
  searchStem,
  searchTokens,
} from "@ewatrade/utils/search-rank"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
} from "../../generated/prisma/enums"
import type { ListCatalogItemsPageInput } from "./catalog"
import { CatalogError } from "./catalog-errors"
import { catalogKind, catalogStatus } from "./catalog-read"
import {
  type ListSortKey,
  buildScopedListCursorWhere,
  buildScopedListPageWhere,
} from "./list-sort"

export async function catalogListPageQuery(
  db: Pick<PrismaClient, "catalogItem">,
  input: ListCatalogItemsPageInput,
  options: { itemIds?: string[] } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const normalizedQuery = input.query?.trim()
  const baseWhere: Prisma.CatalogItemWhereInput = {
    ...(options.itemIds ? { id: { in: options.itemIds } } : {}),
    kind: input.kind ? catalogKind(input.kind) : undefined,
    status: input.status ? catalogStatus(input.status) : undefined,
    systemRole: null,
    tenantId: input.tenantId,
  }
  // Deep search: any query word may match any searchable field; results are
  // then ranked by how much of the query each item matches.
  const searchTerms = normalizedQuery
    ? searchTokens(normalizedQuery).map(searchStem)
    : []
  const where: Prisma.CatalogItemWhereInput = {
    ...baseWhere,
    ...(searchTerms.length
      ? { OR: searchTerms.flatMap(catalogSearchConditions) }
      : {}),
  }
  if (searchTerms.length && input.searchOrder !== "stable")
    return { limit, where, baseWhere, ranked: true as const }
  const sortFields: Array<{
    direction: "asc" | "desc"
    field: "name" | "kind" | "status" | "updatedAt"
    queryField: "name" | "kind" | "status" | "updatedAt"
  }> = input.sort
    ? [
        {
          field: input.sort.field,
          direction: input.sort.direction,
          queryField: input.sort.field,
        },
      ]
    : [{ field: "updatedAt", direction: "desc", queryField: "updatedAt" }]
  const cursor = input.cursor
    ? await db.catalogItem.findFirst({
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          updatedAt: true,
        },
        where: buildScopedListCursorWhere(
          where,
          input.cursor,
        ) as Prisma.CatalogItemWhereInput,
      })
    : null
  if (input.cursor && !cursor) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "The catalog list changed. Refresh to continue.",
    )
  }
  const orderBy = [
    ...sortFields.map(({ queryField, direction }) => ({
      [queryField]: direction,
    })),
    { id: input.sort ? "asc" : "desc" },
  ] as Prisma.CatalogItemOrderByWithRelationInput[]
  const continuationKeys: ListSortKey[] = cursor
    ? [
        ...sortFields.map(({ field, direction }) => ({
          field,
          direction,
          value: cursor[field],
          enumValues:
            field === "kind"
              ? Object.values(CatalogItemKind)
              : field === "status"
                ? Object.values(CatalogRecordStatus)
                : undefined,
        })),
        {
          field: "id",
          direction: input.sort ? "asc" : "desc",
          value: cursor.id,
        },
      ]
    : []

  return {
    limit,
    baseWhere,
    orderBy,
    ranked: false as const,
    where: cursor
      ? (buildScopedListPageWhere(
          where,
          continuationKeys,
        ) as Prisma.CatalogItemWhereInput)
      : where,
  }
}

function catalogSearchConditions(term: string): Prisma.CatalogItemWhereInput[] {
  const contains = { contains: term, mode: "insensitive" as const }
  const kindWord = term.toLowerCase()
  return [
    { name: contains },
    { slug: contains },
    { description: contains },
    { category: contains },
    ...(kindWord === "product"
      ? [{ kind: CatalogItemKind.PRODUCT }]
      : kindWord === "service"
        ? [{ kind: CatalogItemKind.SERVICE }]
        : []),
    {
      product: {
        is: {
          currentUnitConfiguration: {
            is: {
              units: {
                some: { OR: [{ name: contains }, { symbol: contains }] },
              },
            },
          },
        },
      },
    },
    {
      variants: {
        some: { OR: [{ name: contains }, { description: contains }] },
      },
    },
    { offerings: { some: { name: contains } } },
  ]
}

type SearchableCatalogItem = {
  name: string
  category: string | null
  description: string | null
  kind: string
  variants: Array<{ name: string; offerings: Array<{ name: string }> }>
  product: {
    currentUnitConfiguration: { units: Array<{ name: string }> } | null
  } | null
}
export function catalogSearchFields(
  item: SearchableCatalogItem,
): SearchField[] {
  return [
    { text: item.name },
    ...item.variants.flatMap((variant) => [
      { text: variant.name, weight: 0.9 },
      ...variant.offerings.map((offering) => ({
        text: offering.name,
        weight: 0.9,
      })),
    ]),
    ...(item.product?.currentUnitConfiguration?.units ?? []).map((unit) => ({
      text: unit.name,
      weight: 0.8,
    })),
    { text: item.category, weight: 0.7 },
    { text: item.kind.toLowerCase(), weight: 0.6 },
    { text: item.description, weight: 0.4 },
  ]
}
export const RANKED_SEARCH_CANDIDATES = 300
export const RANK_CURSOR = "rank:"
