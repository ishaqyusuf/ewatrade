import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type {
  listCatalogLowStockPage,
  listCatalogRunningLow,
} from "@ewatrade/db/queries"

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
      title: "Low stock",
      value: `${page.lowStock.length} ${page.lowStock.length === 1 ? "item" : "items"} at ${page.threshold} or less`,
      scope,
      asOf,
      summary: page.hasMore ? "More items still to check" : "",
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
        summary: `${row.variantName} · ${row.offeringName}`.slice(0, 200),
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
        summary: row.reason.slice(0, 200),
        detail: `${row.variantName.slice(0, 160)} · ${row.unitName.slice(0, 80)}. ${row.reason} No zero stock has been inferred.`,
      }),
    ),
  ]
}

type RunningLow = Awaited<ReturnType<typeof listCatalogRunningLow>>
type RunningLowRow = RunningLow["items"][number]

/** "9 bags", "1 crate"; short codes such as "kg" stay as saved. */
function stockAmount(quantity: string, unitName: string) {
  const unit = unitName.trim()
  const plain =
    quantity === "1" ||
    unit.length <= 2 ||
    /s$/i.test(unit) ||
    unit === unit.toUpperCase()
  return `${quantity} ${plain ? unit.toLowerCase() : `${unit.toLowerCase()}s`}`
}

function rowName(row: RunningLowRow) {
  return (
    row.variantName && row.variantName !== row.productName
      ? `${row.productName} · ${row.variantName}`
      : row.productName
  ).slice(0, 160)
}

/**
 * "What's running low?" without a threshold: each Product's saved low-stock
 * level, as the Inventory page's Running low. Products without a level are
 * never called low; out-of-stock ones are named, and when no level is set at
 * all, the few with the least left.
 */
export function generalRunningLowAnswers(
  result: RunningLow,
  storeName: string,
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  const scope = storeName.slice(0, 300)
  const noLevels = result.levelsSet === 0
  const fewestLeft = noLevels ? result.withoutLevel.fewestLeft : []
  const row = (
    item: RunningLowRow,
    summary: string,
    detail: string,
  ): GeneralAnswer => ({
    id: `running_low_${crypto.randomUUID()}`,
    title: rowName(item),
    value: item.out
      ? "Out of stock"
      : stockAmount(item.availableQuantity, item.unitName).slice(0, 160),
    scope: `${scope} · Running low`.slice(0, 500),
    asOf,
    summary: summary.slice(0, 200),
    detail: `${detail} Free to sell after reservations: ${item.availableQuantity} ${item.unitName.slice(0, 80)}. Loose stock kept in the Store only.`,
  })
  return [
    {
      id: `running_low_${crypto.randomUUID()}`,
      title: "Running low",
      value: noLevels
        ? "No low-stock levels set"
        : `${result.items.length} ${result.items.length === 1 ? "item" : "items"}`,
      scope,
      asOf,
      summary: noLevels
        ? "Set a level on each product in Inventory"
        : result.partial
          ? "Some stock lines were not checked"
          : "",
      detail: `Uses each Product's saved low-stock level (the Inventory page's Running low): loose stock kept in this Store, free to sell after reservations, at or below the level. ${result.levelsSet} products have a level; ${result.levelsMissing} have none and are never called low. ${result.withoutLevel.out.length} products without a level are out of stock.${noLevels ? ` No level is set, so the ${fewestLeft.length} products with the least left are listed instead; say so and that levels are set per product in Inventory.` : ""} ${result.partial ? "The scan stopped at its bound; more stock lines exist." : "Every stock line was checked."} Do not ask for a threshold; one given by the owner uses the threshold scan instead.`,
    },
    ...result.items.map((item) =>
      row(
        item,
        `Low-stock level ${stockAmount(item.lowStockLevel ?? "0", item.unitName)}`,
        `At or below its saved level of ${item.lowStockLevel} ${item.unitName.slice(0, 80)}.`,
      ),
    ),
    ...result.withoutLevel.out.map((item) =>
      row(item, "No low-stock level set", "Out of stock; no saved level."),
    ),
    ...fewestLeft.map((item) =>
      row(
        item,
        "Least left · no level set",
        "Among the products with the least left; no saved level, so not judged low.",
      ),
    ),
  ]
}
