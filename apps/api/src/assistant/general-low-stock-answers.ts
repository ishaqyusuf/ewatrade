import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listCatalogLowStockPage } from "@ewatrade/db/queries"

type Page = Awaited<ReturnType<typeof listCatalogLowStockPage>>
export function generalLowStockAnswers(
  page: Page,
  storeName: string,
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  const scope = storeName.slice(0, 300)
  return [
    {
      id: `low_stock_page_${crypto.randomUUID()}`,
      title: "Low-stock scan",
      value: `${page.lowStock.length} matches on this page`,
      scope,
      asOf,
      detail: `Scanned ${page.scannedCount} offerings; ${page.unavailable.length} unavailable. Threshold: at most ${page.threshold} in EACH offering's named unit. ${page.hasMore ? "More offerings remain; continue the scan." : "End of this live scan."} This page is not a business total or reorder policy. Shared offerings may use the same balance; never add their quantities together.`,
    },
    ...page.lowStock.map(
      (row): GeneralAnswer => ({
        id: `low_stock_${crypto.randomUUID()}`,
        title: `Low stock · ${row.productName}`.slice(0, 160),
        value:
          row.status === "available"
            ? `${row.availableOfferingQuantity} ${row.unitName}`.slice(0, 160)
            : "Unavailable",
        scope: `${scope} · ${row.offeringName}`.slice(0, 500),
        asOf,
        detail: `${row.variantName.slice(0, 160)} · ${row.offeringName.slice(0, 160)}. Available selling units after reservations; at most ${page.threshold} ${row.unitName.slice(0, 80)}. Shared-unit quantities are rounded down to the permitted selling precision.`,
      }),
    ),
    ...page.unavailable.map(
      (row): GeneralAnswer => ({
        id: `stock_unavailable_${crypto.randomUUID()}`,
        title: `Stock · ${row.productName}`.slice(0, 160),
        value: "Unavailable",
        scope: `${scope} · ${row.offeringName}`.slice(0, 500),
        asOf,
        detail: `${row.variantName.slice(0, 160)} · ${row.unitName.slice(0, 80)}. ${row.reason} No zero stock has been inferred.`,
      }),
    ),
  ]
}
