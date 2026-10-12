import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import type { OrderScope } from "../order-visibility"
import { makeReportCursor, readReportCursor, reportCursorScope } from "./cursor"
import { type BusinessReport, type ReportPeriod, reportPeriod } from "./types"

export const ITEM_SALES_PAGE_SIZE = 10
export type ItemGroup = {
  catalogItemId: string | null
  catalogItemName: string | null
  variantId: string | null
  variantName: string | null
  offeringId: string
  offeringName: string | null
  inventoryUnitId: string | null
  inventoryUnitName: string | null
  configurationVersionId: string | null
  currencyCode?: string | null
  quantity: string
  valueMinor: string
  lineCount: string | bigint
  sortKey: string
}
export type ItemSalesAggregate = {
  groupCount: string
  lineCount: string
  valueMinor: string
}
type ItemInput = OrderScope &
  ReportPeriod & { catalogItemId?: string; cursor?: string; storeName?: string }
function cursorScope(input: ItemInput) {
  return reportCursorScope({
    report: "item_sales",
    tenantId: input.tenantId,
    storeId: input.storeId,
    createdByUserId: input.createdByUserId ?? null,
    from: input.from.toISOString(),
    before: input.before.toISOString(),
    timezone: input.timezone,
    currencyCode: input.currencyCode,
    catalogItemId: input.catalogItemId ?? null,
  })
}
export function itemSalesReportFromGroups(
  groups: ItemGroup[],
  aggregate: ItemSalesAggregate,
  input: ItemInput,
): BusinessReport {
  const page = groups.slice(0, ITEM_SALES_PAGE_SIZE)
  const last = page.at(-1)
  return {
    report: "item_sales",
    asOf: new Date().toISOString(),
    complete: true,
    scope: `${input.storeName ?? "Selected Store"} · ${input.createdByUserId ? "Your orders" : "All permitted orders"}`,
    dateBasis: "Order createdAt; start inclusive, end exclusive",
    currencyCode: input.currencyCode,
    period: reportPeriod(input),
    totals: {
      kind: "item_sales",
      groupCount: aggregate.groupCount,
      lineCount: aggregate.lineCount,
      bookedValueMinor: aggregate.valueMinor,
    },
    summary: `All ${aggregate.groupCount} original item groups; ${aggregate.lineCount} lines; booked line value ${aggregate.valueMinor} ${input.currencyCode} minor units.`,
    pagination: {
      totalRows: aggregate.groupCount,
      nextCursor:
        groups.length > ITEM_SALES_PAGE_SIZE && last
          ? makeReportCursor(last.sortKey, cursorScope(input))
          : null,
    },
    rows: page.map((group) => ({
      id: group.sortKey,
      label: `${group.catalogItemName ?? "Snapshot unavailable"} · ${group.variantName ?? "Unknown variant"}`,
      value: `${group.quantity} ${group.inventoryUnitName ?? group.offeringName ?? "original offering units"}`,
      moneyDetails: [
        { label: "Booked line value", amountMinor: group.valueMinor },
      ],
      detail: `${group.lineCount} ${String(group.lineCount) === "1" ? "line" : "lines"}. Snapshot currency ${group.currencyCode ?? "unavailable"}. Offering ${group.offeringId}; unit ${group.inventoryUnitId ?? "unavailable"}; configuration ${group.configurationVersionId ?? "unavailable"}. Original snapshots; unlike units/configurations remain separate.`,
      ...(group.catalogItemId
        ? { target: { kind: "catalog_item" as const, id: group.catalogItemId } }
        : {}),
    })),
    gaps: [
      "Confirmed through completed orders only; drafts, pending, cancelled and refunded orders excluded.",
      "Original booked line quantities/value, not fulfilled or net-returned quantities. Post-sale credits, order discounts, tax and charges are not allocated to items. No profit inferred; item costs unavailable.",
      "Complete line-value/group/line aggregate covers all matching sources before detail pagination. Quantities are never summed across unlike units. Missing snapshots remain unknown; current catalog names/prices never replace them. Pages are live request snapshots.",
    ],
  }
}
/** Complete server aggregate plus a bounded detail page, all in the same snapshot. */
export async function getBusinessItemSalesReportInTransaction(
  tx: Prisma.TransactionClient,
  input: ItemInput,
) {
  reportPeriod(input)
  if (!input.storeId) throw new Error("Choose a Store for item sales.")
  const after = readReportCursor(input.cursor, cursorScope(input))
  const result = await tx.$queryRaw<
    Array<ItemSalesAggregate & { groups: ItemGroup[] | null }>
  >(Prisma.sql`
    WITH groups AS (
      SELECT s."catalogItemId", s."catalogItemName", s."variantId", s."variantName", l."offeringId", s."offeringName",
        s."inventoryUnitId", s."inventoryUnitName", s."configurationVersionId", s."currencyCode",
        SUM(l.quantity)::text AS quantity, SUM(l."totalMinor")::text AS "valueMinor", COUNT(*)::text AS "lineCount",
        jsonb_build_array(s."catalogItemId", s."catalogItemName", s."variantId", s."variantName", l."offeringId", s."offeringName", s."inventoryUnitId", s."inventoryUnitName", s."configurationVersionId", s."currencyCode")::text AS "sortKey"
      FROM "CommercialOrderLine" l JOIN "CommercialOrder" o ON o.id = l."orderId"
      LEFT JOIN "OfferingSnapshot" s ON s."orderLineId" = l.id
      WHERE o."tenantId" = ${input.tenantId} AND o."storeId" = ${input.storeId} AND o."currencyCode" = ${input.currencyCode}
        AND o."createdAt" >= ${input.from} AND o."createdAt" < ${input.before}
        AND o.status IN ('CONFIRMED', 'FULFILLING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED')
        ${input.createdByUserId ? Prisma.sql`AND o."createdByUserId" = ${input.createdByUserId}` : Prisma.empty}
        ${input.catalogItemId ? Prisma.sql`AND s."catalogItemId" = ${input.catalogItemId}` : Prisma.empty}
      GROUP BY s."catalogItemId", s."catalogItemName", s."variantId", s."variantName", l."offeringId", s."offeringName", s."inventoryUnitId", s."inventoryUnitName", s."configurationVersionId", s."currencyCode"
    ), summary AS (
      SELECT COUNT(*)::text AS "groupCount", COALESCE(SUM("lineCount"::numeric),0)::text AS "lineCount", COALESCE(SUM("valueMinor"::numeric),0)::text AS "valueMinor" FROM groups
    ), page AS (
      SELECT * FROM groups ${after ? Prisma.sql`WHERE "sortKey" COLLATE "C" > ${after} COLLATE "C"` : Prisma.empty}
      ORDER BY "sortKey" COLLATE "C" LIMIT ${ITEM_SALES_PAGE_SIZE + 1}
    ) SELECT summary.*, (SELECT jsonb_agg(to_jsonb(page) ORDER BY page."sortKey" COLLATE "C") FROM page) AS groups FROM summary
  `)
  const row = result[0]
  if (!row) throw new Error("Complete item aggregate unavailable.")
  return itemSalesReportFromGroups(row.groups ?? [], row, input)
}
export function getBusinessItemSalesReport(db: PrismaClient, input: ItemInput) {
  return db.$transaction(
    (tx) => getBusinessItemSalesReportInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
