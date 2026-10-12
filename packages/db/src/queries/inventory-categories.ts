import {
  type StockCategorySelector,
  normalizeStockCategoryName,
} from "@ewatrade/utils/inventory-categories"
import { Prisma } from "../../generated/prisma/client"
import type { PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog"

export const stockOperationCategoryGraph = {
  include: { categoryName: true },
  orderBy: { position: "asc" },
} satisfies Prisma.StockOperation$categoriesArgs

export function serializeStockCategories(
  categories: Prisma.StockOperationCategoryGetPayload<{
    include: { categoryName: true }
  }>[],
) {
  return categories.map((category) => ({
    id: category.id,
    categoryNameId: category.categoryNameId,
    name: category.categoryName.name,
    position: category.position,
  }))
}

export async function resolveStockCategories(
  tx: Prisma.TransactionClient,
  tenantId: string,
  categories: StockCategorySelector[],
) {
  const resolved = new Map<number, number>()
  // Lock shared names in the same order even when two users choose reverse pill order.
  const ordered = categories
    .map((category, index) => ({
      category,
      index,
      key:
        "name" in category
          ? `name:${normalizeStockCategoryName(category.name).normalizedName}`
          : `id:${category.categoryNameId}`,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
  for (const { category, index } of ordered) {
    if ("categoryNameId" in category) {
      const existing = await tx.stockOperationCategoryName.findFirst({
        where: { tenantId, id: category.categoryNameId },
        select: { id: true },
      })
      if (!existing)
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Category not found for this business.",
        )
      resolved.set(index, existing.id)
    } else {
      const { name, normalizedName } = normalizeStockCategoryName(category.name)
      // Native PostgreSQL upsert avoids select/create races between stock transactions.
      const [record] = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        INSERT INTO "StockOperationCategoryName" ("tenantId", "name", "normalizedName", "createdAt")
        VALUES (${tenantId}, ${name}, ${normalizedName}, NOW())
        ON CONFLICT ("tenantId", "normalizedName") DO UPDATE
        SET "normalizedName" = EXCLUDED."normalizedName"
        RETURNING "id"
      `)
      if (!record)
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Category could not be created.",
        )
      resolved.set(index, record.id)
    }
  }
  const ids = new Set(
    categories
      .map((_, index) => resolved.get(index))
      .filter((id): id is number => id !== undefined),
  )
  return [...ids].map((categoryNameId, position) => ({
    tenantId,
    categoryNameId,
    position,
  }))
}

/** Bounded purchase composition; resolve shared names once while preserving each line's pill order. */
export async function resolvePurchaseStockCategoryGroups(
  tx: Prisma.TransactionClient,
  tenantId: string,
  groups: StockCategorySelector[][],
) {
  if (
    !groups.length ||
    groups.length > 10 ||
    groups.some((group) => group.length > 10)
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Choose at most ten categories for each of 1–10 goods lines.",
    )
  const ids = [
    ...new Set(
      groups.flatMap((group) =>
        group.flatMap((category) =>
          "categoryNameId" in category ? [category.categoryNameId] : [],
        ),
      ),
    ),
  ].sort((a, b) => a - b)
  const names = new Map<string, string>()
  for (const group of groups)
    for (const category of group)
      if ("name" in category) {
        const { name, normalizedName } = normalizeStockCategoryName(
          category.name,
        )
        if (!names.has(normalizedName)) names.set(normalizedName, name)
      }
  const existing = ids.length
    ? await tx.stockOperationCategoryName.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true },
      })
    : []
  if (
    existing.length !== ids.length ||
    new Set(existing.map((category) => category.id)).size !== ids.length ||
    existing.some((category) => !ids.includes(category.id))
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Category not found for this business.",
    )
  const named = names.size
    ? await tx.$queryRaw<
        Array<{ id: number; normalizedName: string }>
      >(Prisma.sql`
    INSERT INTO "StockOperationCategoryName" ("tenantId", "name", "normalizedName", "createdAt")
    VALUES ${Prisma.join([...names].sort(([a], [b]) => a.localeCompare(b)).map(([normalizedName, name]) => Prisma.sql`(${tenantId}, ${name}, ${normalizedName}, NOW())`))}
    ON CONFLICT ("tenantId", "normalizedName") DO UPDATE SET "normalizedName" = EXCLUDED."normalizedName"
    RETURNING "id", "normalizedName"
  `)
    : []
  const namedIds = new Map(
    named.map((category) => [category.normalizedName, category.id]),
  )
  if (
    namedIds.size !== names.size ||
    [...names.keys()].some((name) => !namedIds.has(name))
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Category could not be created.",
    )
  return groups.map((group) => {
    const resolved = new Set<number>()
    for (const category of group) {
      const id =
        "categoryNameId" in category
          ? category.categoryNameId
          : namedIds.get(
              normalizeStockCategoryName(category.name).normalizedName,
            )
      if (id === undefined)
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Category not found for this business.",
        )
      resolved.add(id)
    }
    return [...resolved].map((categoryNameId, position) => ({
      tenantId,
      categoryNameId,
      position,
    }))
  })
}

export async function listStockOperationCategoryNames(
  db: PrismaClient,
  input: { tenantId: string; query?: string; limit?: number },
) {
  const prefix = input.query
    ?.normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()
  return db.stockOperationCategoryName.findMany({
    where: {
      tenantId: input.tenantId,
      normalizedName: prefix ? { startsWith: prefix } : undefined,
    },
    orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(input.limit ?? 20, 1), 50),
    select: { id: true, name: true },
  })
}
