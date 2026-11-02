import {
  addExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type { StockOperationType } from "../../generated/prisma/enums"

import { CatalogError } from "./catalog-errors"
import {
  serializeStockCategories,
  stockOperationCategoryGraph,
} from "./inventory-categories"

/** Matches the per-operation category bound on capture. */
export const MAX_STOCK_CATEGORY_FILTERS = 10

export type InventoryOperationFilters = {
  tenantId: string
  storeId?: string
  type?: StockOperationType
  /** Match-all: an operation must carry every listed category name. */
  categoryNameIds?: number[]
  /** Only operations with no category assignment rows. */
  uncategorized?: boolean
}

export const operationHistoryInclude = {
  store: { select: { name: true } },
  movements: true,
  categories: stockOperationCategoryGraph,
} satisfies Prisma.StockOperationInclude

export function serializeOperationHistoryRow(
  operation: Prisma.StockOperationGetPayload<{
    include: typeof operationHistoryInclude
  }>,
) {
  return {
    categories: serializeStockCategories(operation.categories),
    actorUserId: operation.actorUserId,
    canonicalNetEffect: operation.movements.reduce(
      (total, movement) =>
        addExactDecimals(total, movement.signedCanonicalEffect.toFixed()),
      "0",
    ),
    createdAt: operation.createdAt,
    effectiveAt: operation.effectiveAt,
    id: operation.id,
    storeId: operation.storeId,
    storeName: operation.store.name,
    movementCount: operation.movements.length,
    reason: operation.reason,
    source: operation.source,
    type: operation.type,
  }
}

/**
 * Deduplicates the selected category names and proves each belongs to this
 * business; a foreign or unknown ID fails without revealing another label.
 */
export async function resolveOperationCategoryFilter(
  db: Pick<PrismaClient, "stockOperationCategoryName">,
  input: Pick<
    InventoryOperationFilters,
    "tenantId" | "categoryNameIds" | "uncategorized"
  >,
) {
  const ids = [...new Set(input.categoryNameIds ?? [])]
  if (input.uncategorized && ids.length)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Choose categories or Uncategorized, not both.",
    )
  if (
    ids.length > MAX_STOCK_CATEGORY_FILTERS ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      `Choose up to ${MAX_STOCK_CATEGORY_FILTERS} categories.`,
    )
  if (
    ids.length &&
    (await db.stockOperationCategoryName.count({
      where: { tenantId: input.tenantId, id: { in: ids } },
    })) !== ids.length
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "A selected category is not available in this business.",
    )
  return ids
}

/** Prisma form of the category filters, for the bounded recent list. */
export function operationHistoryWhere(
  input: InventoryOperationFilters,
  categoryNameIds: number[],
): Prisma.StockOperationWhereInput {
  return {
    tenantId: input.tenantId,
    storeId: input.storeId,
    type: input.type,
    ...(input.uncategorized ? { categories: { none: {} } } : {}),
    ...(categoryNameIds.length
      ? {
          AND: categoryNameIds.map((categoryNameId) => ({
            categories: { some: { categoryNameId } },
          })),
        }
      : {}),
  }
}

/** The Stock history change groups; mirrors the dashboard's stockChangeGroup. */
export type StockChangeGroup = "in" | "out" | "count" | "move"
const COUNT_TYPES = ["COUNT_RECONCILIATION"]
const MOVE_TYPES = [
  "TRANSFER",
  "TRANSFORMATION",
  "CUSTODY_ASSIGNMENT",
  "CUSTODY_RETURN",
]

/** SQL predicates on `o` (StockOperation); every filter is applied here. */
function operationConditions(
  input: InventoryOperationFilters & {
    group?: StockChangeGroup
    search?: string
  },
  categoryNameIds: number[],
) {
  const conditions = [Prisma.sql`o."tenantId" = ${input.tenantId}`]
  if (input.storeId) conditions.push(Prisma.sql`o."storeId" = ${input.storeId}`)
  if (input.type) conditions.push(Prisma.sql`o."type"::text = ${input.type}`)
  if (input.uncategorized)
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "StockOperationCategory" c
      WHERE c."tenantId" = o."tenantId" AND c."stockOperationId" = o."id")`)
  if (categoryNameIds.length)
    conditions.push(Prisma.sql`(
      SELECT count(*) FROM "StockOperationCategory" c
      WHERE c."tenantId" = o."tenantId" AND c."stockOperationId" = o."id"
        AND c."categoryNameId" IN (${Prisma.join(categoryNameIds)})
    ) = ${categoryNameIds.length}`)
  if (input.group === "count" || input.group === "move")
    conditions.push(
      Prisma.sql`o."type"::text IN (${Prisma.join(
        input.group === "count" ? COUNT_TYPES : MOVE_TYPES,
      )})`,
    )
  if (input.group === "in" || input.group === "out") {
    const net = Prisma.sql`(SELECT coalesce(sum(m."signedCanonicalEffect"), 0)
      FROM "StockMovement" m WHERE m."operationId" = o."id")`
    conditions.push(
      Prisma.sql`o."type"::text NOT IN (${Prisma.join([...COUNT_TYPES, ...MOVE_TYPES])})`,
      input.group === "out" ? Prisma.sql`${net} < 0` : Prisma.sql`${net} >= 0`,
    )
  }
  const search = input.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`
    conditions.push(Prisma.sql`(
      o."reason" ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "Store" s
        WHERE s."id" = o."storeId" AND s."name" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "StockOperationCategory" c
        JOIN "StockOperationCategoryName" n
          ON n."tenantId" = c."tenantId" AND n."id" = c."categoryNameId"
        WHERE c."tenantId" = o."tenantId" AND c."stockOperationId" = o."id"
          AND n."name" ILIKE ${pattern}))`)
  }
  return conditions
}

/** Newest-first IDs, then one bounded relation read in the same order. */
async function readOperationHistory(
  db: PrismaClient,
  conditions: Prisma.Sql[],
  take: number,
) {
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT o."id" FROM "StockOperation" o
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY o."effectiveAt" DESC, o."createdAt" DESC, o."id" DESC
    LIMIT ${take}`
  const rows = await db.stockOperation.findMany({
    include: operationHistoryInclude,
    where: { id: { in: ids.map((row) => row.id) } },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((row) => {
    const operation = byId.get(row.id)
    return operation ? [serializeOperationHistoryRow(operation)] : []
  })
}

/** Complete newest-first history, filtered on the server before each page is cut. */
export async function listInventoryOperationHistoryPage(
  db: PrismaClient,
  input: InventoryOperationFilters & {
    group?: StockChangeGroup
    search?: string
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Invalid stock history page size.",
    )
  const conditions = operationConditions(
    input,
    await resolveOperationCategoryFilter(db, input),
  )
  if (input.cursor) {
    const [cursor] = await db.$queryRaw<Array<{ id: string }>>`
      SELECT o."id" FROM "StockOperation" o
      WHERE ${Prisma.join(conditions, " AND ")} AND o."id" = ${input.cursor}`
    if (!cursor)
      throw new CatalogError(
        "REVISION_CONFLICT",
        "The stock history changed. Refresh to continue.",
      )
    // Row comparison matches the all-descending order; no timestamp parameters.
    conditions.push(Prisma.sql`(o."effectiveAt", o."createdAt", o."id") < (
      SELECT k."effectiveAt", k."createdAt", k."id" FROM "StockOperation" k
      WHERE k."id" = ${cursor.id} AND k."tenantId" = ${input.tenantId})`)
  }
  const rows = await readOperationHistory(db, conditions, limit + 1)
  const items = rows.slice(0, limit)
  return {
    rows: items,
    nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
  }
}

type TotalRow = {
  storeId: string
  productId: string
  variantId: string
  configurationVersionId: string
  net: string
  operationCount: number
}

/**
 * Exact net stock effect of the qualifying operations, per Store, Product
 * variant and unit configuration, in that configuration's canonical unit.
 *
 * Filters select original operations only; every correction (and correction
 * of a correction) is folded into the original it corrects, so a 20-egg
 * receipt corrected to 18 totals 18 under the receipt's type and categories.
 * Movements are summed once per operation, however many categories it has.
 */
export async function getInventoryOperationTotals(
  db: PrismaClient,
  input: InventoryOperationFilters,
) {
  const conditions = [
    ...operationConditions(
      input,
      await resolveOperationCategoryFilter(db, input),
    ),
    Prisma.sql`o."correctionOfOperationId" IS NULL`,
  ]
  const tree = Prisma.sql`
    WITH RECURSIVE roots AS (
      SELECT o."id" FROM "StockOperation" o
      WHERE ${Prisma.join(conditions, " AND ")}
    ), tree AS (
      SELECT r."id", r."id" AS "rootId" FROM roots r
      UNION ALL
      SELECT o."id", t."rootId" FROM "StockOperation" o
      JOIN tree t ON o."correctionOfOperationId" = t."id"
      WHERE o."tenantId" = ${input.tenantId}
    )`
  const [groups, counts] = await Promise.all([
    db.$queryRaw<TotalRow[]>`${tree}
      SELECT b."storeId", b."productId", b."variantId",
        m."configurationVersionId",
        sum(m."signedCanonicalEffect")::text AS "net",
        count(DISTINCT t."rootId")::int AS "operationCount"
      FROM tree t
      JOIN "StockMovement" m ON m."operationId" = t."id"
      JOIN "StockBalanceSource" b ON b."id" = m."balanceSourceId"
      GROUP BY b."storeId", b."productId", b."variantId",
        m."configurationVersionId"`,
    db.$queryRaw<Array<{ operations: number; corrections: number }>>`${tree}
      SELECT (SELECT count(*) FROM roots)::int AS "operations",
        (SELECT count(*) FROM tree)::int - (SELECT count(*) FROM roots)::int
          AS "corrections"`,
  ])
  const [stores, products, variants, units] = await Promise.all([
    db.store.findMany({
      where: {
        tenantId: input.tenantId,
        id: { in: [...new Set(groups.map((row) => row.storeId))] },
      },
      select: { id: true, name: true },
    }),
    db.catalogProduct.findMany({
      where: { id: { in: [...new Set(groups.map((row) => row.productId))] } },
      select: { id: true, catalogItem: { select: { id: true, name: true } } },
    }),
    db.sellableVariant.findMany({
      where: { id: { in: [...new Set(groups.map((row) => row.variantId))] } },
      select: { id: true, name: true },
    }),
    db.inventoryUnit.findMany({
      where: {
        configurationVersionId: {
          in: [...new Set(groups.map((row) => row.configurationVersionId))],
        },
        stockBehavior: "CANONICAL_SHARED",
      },
      orderBy: { sortOrder: "asc" },
      select: { configurationVersionId: true, name: true },
    }),
  ])
  const storeName = new Map(stores.map((row) => [row.id, row.name]))
  const product = new Map(products.map((row) => [row.id, row.catalogItem]))
  const variantName = new Map(variants.map((row) => [row.id, row.name]))
  const canonicalUnitName = new Map<string, string>()
  for (const unit of units)
    if (!canonicalUnitName.has(unit.configurationVersionId))
      canonicalUnitName.set(unit.configurationVersionId, unit.name)
  const rows = groups.map((row) => ({
    storeId: row.storeId,
    storeName: storeName.get(row.storeId) ?? null,
    productId: row.productId,
    catalogItemId: product.get(row.productId)?.id ?? null,
    productName: product.get(row.productId)?.name ?? null,
    variantId: row.variantId,
    variantName: variantName.get(row.variantId) ?? null,
    configurationVersionId: row.configurationVersionId,
    canonicalUnitName:
      canonicalUnitName.get(row.configurationVersionId) ?? null,
    netCanonicalQuantity: parseExactDecimal(row.net, { allowNegative: true }),
    operationCount: row.operationCount,
  }))
  rows.sort(
    (a, b) =>
      (a.storeName ?? "").localeCompare(b.storeName ?? "") ||
      (a.productName ?? "").localeCompare(b.productName ?? "") ||
      (a.variantName ?? "").localeCompare(b.variantName ?? "") ||
      a.configurationVersionId.localeCompare(b.configurationVersionId),
  )
  return {
    operationCount: counts[0]?.operations ?? 0,
    correctionCount: counts[0]?.corrections ?? 0,
    rows,
  }
}
