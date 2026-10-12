import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { listInventoryBalanceReport } from "../inventory-reporting"
import type { BusinessReport } from "./types"

export const STOCK_REPORT_SOURCE_LIMIT = 200
export async function getBusinessStockReportInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    catalogItemId?: string
    storeName?: string
  },
): Promise<BusinessReport> {
  const where = {
    tenantId: input.tenantId,
    storeId: input.storeId,
    ...(input.catalogItemId
      ? { product: { catalogItemId: input.catalogItemId } }
      : {}),
  }
  // Same snapshot as the canonical read; no preflight/read race can exceed the cap.
  const sources = await tx.stockBalanceSource.findMany({
    where,
    select: { id: true },
    take: STOCK_REPORT_SOURCE_LIMIT + 1,
  })
  const complete = sources.length <= STOCK_REPORT_SOURCE_LIMIT
  const report = complete
    ? await listInventoryBalanceReport(tx, {
        ...input,
        includeCompatibleTotals: true,
      })
    : null
  return {
    report: "stock",
    asOf: new Date().toISOString(),
    complete,
    scope: input.storeName ?? "Selected Store",
    currencyCode: null,
    period: null,
    dateBasis:
      "Current repeatable-read inventory snapshot; no historical date filter",
    summary: report
      ? `${report.rows.length} complete balance sources; ${report.compatibleCanonicalTotals.length} compatible groups.`
      : "Complete stock report unavailable; narrow the item scope.",
    rows:
      report?.rows.map((row) => ({
        id: row.balanceSourceId,
        label: `${row.productName} · ${row.variantName}`,
        value: `${row.availableQuantity} ${row.inventoryUnitName} available`,
        detail: `On hand ${row.onHandQuantity}; reserved ${row.reservedQuantity}. Source ${row.balanceSourceId}; unit ${row.inventoryUnitId}; configuration ${row.configurationVersionId}; revision ${row.revision}; ${row.kind}; custody ${row.custodyType}${row.custodyReferenceId ? ` (${row.custodyReferenceId})` : ""}.`,
        target: { kind: "catalog_item" as const, id: row.catalogItemId },
      })) ?? [],
    gaps: [
      "Existing balance sources only; missing sources are unknown, never zero. Inventory quantities are not money; no currency or stock value inferred.",
      "Original source units/configurations/custody remain separate. Transit has zero sellable availability. Use offering availability before selling.",
      ...(report
        ? report.compatibleCanonicalTotals.map(
            (group) =>
              `Compatible group ${group.variantId}/${group.configurationVersionId}/${group.custodyType}/${group.custodyReferenceId ?? ""}: on hand ${group.onHandCanonicalQuantity}; reserved ${group.reservedCanonicalQuantity}; available ${group.availableCanonicalQuantity} canonical units (${group.components.length} sources). Informational only.`,
          )
        : []),
    ],
  }
}
export function getBusinessStockReport(
  db: PrismaClient,
  input: Parameters<typeof getBusinessStockReportInTransaction>[1],
) {
  return db.$transaction(
    (tx) => getBusinessStockReportInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
