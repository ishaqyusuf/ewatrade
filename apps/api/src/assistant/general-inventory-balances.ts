import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listInventoryBalancePage } from "@ewatrade/db/queries"
import { inventoryBalancePageSchema } from "../schemas/inventory"

export const generalInventoryBalancesInput = inventoryBalancePageSchema.pick({
  catalogItemId: true,
  cursor: true,
})
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
    ...page.rows.map((row) => ({
      id: `inventory_source_${crypto.randomUUID()}`,
      title: `${row.productName} · ${row.variantName}`.slice(0, 160),
      value:
        `${row.availableQuantity} ${row.inventoryUnitName} available`.slice(
          0,
          240,
        ),
      scope: `${row.storeName} · Source ${row.balanceSourceId}`.slice(0, 500),
      asOf,
      detail:
        `On hand ${row.onHandQuantity}; reserved ${row.reservedQuantity}, in ${row.inventoryUnitName}. Custody ${row.custodyType}${row.custodyReferenceId ? ` (${row.custodyReferenceId})` : ""}; ${row.kind}. Configuration ${row.configurationVersionId}; revision ${row.revision}. ${row.custodyType === "TRANSIT" ? "In-transit stock is not available to sell. " : ""}This source quantity is not a selling-offering quantity.`.slice(
          0,
          1000,
        ),
    })),
  ]
}
