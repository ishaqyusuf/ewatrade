import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listInventoryCompatibleTotalsPage } from "@ewatrade/db/queries"
import { inventoryCompatibleTotalsPageSchema } from "../schemas/inventory"
export const generalInventoryTotalsInput =
  inventoryCompatibleTotalsPageSchema.pick({
    catalogItemId: true,
    cursor: true,
  })
export function generalInventoryTotalsAnswers(
  page: Awaited<ReturnType<typeof listInventoryCompatibleTotalsPage>>,
  input: { storeName: string; catalogItemId?: string; cursor?: string },
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  return [
    {
      id: `stock_totals_${crypto.randomUUID()}`,
      title: "Compatible inventory totals",
      value: `${page.items.length} groups on this page`,
      scope: input.storeName.slice(0, 500),
      asOf,
      detail: `Item filter: ${input.catalogItemId ?? "all"}. ${input.cursor ? "Continuation page" : "First page"}. ${page.nextCursor ? "More groups available." : "End of this list."} Each group includes all matching sources, separated by variant, unit configuration and custody. This page is not a business total. Missing sources are not zero stock.`,
    },
    ...page.items.map((group) => ({
      id: `stock_group_${crypto.randomUUID()}`,
      title: `${group.productName} · ${group.variantName}`.slice(0, 160),
      value:
        `${group.availableCanonicalQuantity} ${group.canonicalUnitName ?? "canonical units"} available`.slice(
          0,
          240,
        ),
      scope:
        `${input.storeName} · Configuration ${group.configurationVersionId}`.slice(
          0,
          500,
        ),
      asOf,
      detail:
        `On hand ${group.onHandCanonicalQuantity}; reserved ${group.reservedCanonicalQuantity}. ${group.sourceCount} source(s), converted to ${group.canonicalUnitName ?? "canonical units (unit name unavailable)"}. Custody ${group.custodyType}${group.custodyReferenceId ? ` (${group.custodyReferenceId})` : ""}. Informational total only; use offering availability before selling. Transit stock is not available to sell.`.slice(
          0,
          1000,
        ),
    })),
  ]
}
