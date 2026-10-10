import type { PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { listInventoryBalanceReport } from "./inventory-reporting"

/** Paginate complete compatible groups, never aggregate a limited source page. */
export async function listInventoryCompatibleTotalsPage(
  db: PrismaClient,
  input: {
    tenantId: string
    storeId: string
    catalogItemId?: string
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 10
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Invalid inventory totals page size.",
    )
  const report = await listInventoryBalanceReport(db, {
    ...input,
    includeCompatibleTotals: true,
  })
  const groups = report.compatibleCanonicalTotals
    .map(({ components, ...group }) => ({
      ...group,
      sourceCount: components.length,
      key: JSON.stringify([
        group.storeId,
        group.variantId,
        group.configurationVersionId,
        group.custodyType,
        group.custodyReferenceId,
      ]),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const index = input.cursor
    ? groups.findIndex((group) => group.key === input.cursor)
    : -1
  if (input.cursor && index < 0)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "The inventory totals changed. Refresh to continue.",
    )
  const items = groups.slice(index + 1, index + 1 + limit)
  const units = items.length
    ? await db.inventoryUnit.findMany({
        where: {
          configurationVersionId: {
            in: items.map((group) => group.configurationVersionId),
          },
          stockBehavior: "CANONICAL_SHARED",
        },
        select: { id: true, name: true, configurationVersionId: true },
      })
    : []
  return {
    items: items.map((group) => {
      const matches = units.filter(
        (unit) => unit.configurationVersionId === group.configurationVersionId,
      )
      return {
        ...group,
        canonicalUnitId: matches.length === 1 ? matches[0]!.id : null,
        canonicalUnitName: matches.length === 1 ? matches[0]!.name : null,
      }
    }),
    nextCursor:
      index + 1 + limit < groups.length ? (items.at(-1)?.key ?? null) : null,
  }
}
