import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listInventoryBalancePage } from "@ewatrade/db/queries"
import { inventoryBalancePageSchema } from "../schemas/inventory"

export const generalInventoryBalancesInput = inventoryBalancePageSchema.pick({
  catalogItemId: true,
  cursor: true,
})

/** Bound display labels while leaving the exact decimal quantity untouched. */
export function generalInventoryQuantityValue(quantity: string, unit: string) {
  const prefix = `${quantity} `
  const suffix = " available"
  const room = 160 - prefix.length - suffix.length
  if (room < 4) throw Error("Exact inventory quantity exceeds answer bounds.")
  let name = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(unit)) {
    if (name.length + segment.length > room - 1) break
    name += segment
  }
  const shortened = unit.length > room
  return {
    value: `${prefix}${shortened ? `${name}…` : unit}${suffix}`,
    shortened,
  }
}
export function generalInventoryBalanceAnswers(
  page: Awaited<ReturnType<typeof listInventoryBalancePage>>,
  input: { storeName: string; catalogItemId?: string; cursor?: string },
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  return [
    {
      id: `inventory_page_${crypto.randomUUID()}`,
      title: "Inventory balance sources",
      value: `${page.rows.length} on this page`,
      scope: input.storeName.slice(0, 500),
      asOf,
      detail: `Item filter: ${input.catalogItemId ?? "all"}. ${input.cursor ? "Continuation page" : "First page"}. ${page.nextCursor ? "More sources available." : "End of this list."} Existing sources only; missing sources are not zero stock. Quantities retain each source's unit and custody. No page total or conversion across unlike units.`,
    },
    ...page.rows.map((row) => {
      const quantity = generalInventoryQuantityValue(
        row.availableQuantity,
        row.inventoryUnitName,
      )
      return {
        id: `inventory_source_${crypto.randomUUID()}`,
        title: `${row.productName} · ${row.variantName}`.slice(0, 160),
        value: quantity.value,
        scope: `${row.storeName} · Source ${row.balanceSourceId}`.slice(0, 500),
        asOf,
        detail:
          `${quantity.shortened ? "Unit label shortened; open the original inventory record for the full name. " : ""}On hand ${row.onHandQuantity}; reserved ${row.reservedQuantity}. ${row.custodyType === "TRANSIT" ? "In-transit stock is not available to sell. " : ""}This source quantity is not a selling-offering quantity. Custody ${row.custodyType}${row.custodyReferenceId ? ` (${row.custodyReferenceId})` : ""}; ${row.kind}. Configuration ${row.configurationVersionId}; revision ${row.revision}. Unit ${row.inventoryUnitName}.`.slice(
            0,
            1000,
          ),
      }
    }),
  ]
}
