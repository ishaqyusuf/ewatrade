import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { z } from "zod"
import { catalogActivitySchema } from "../schemas/catalog-detail"
import { catalogRouter } from "../trpc/routers/catalog"
import { orderScope } from "../trpc/order-scope"
import { requireGeneralScope, type GeneralContext } from "./general-context"

export const generalCatalogHistoryInput = catalogActivitySchema
  .pick({ itemId: true, cursor: true, category: true })
  .extend({
    mode: z.enum(["orders", "activity"]).default("activity"),
  })
  .strict()
const amount = (minor: number | null, currency: string | null) => {
  if (minor === null || !currency) return "Amount unavailable"
  if (!Number.isSafeInteger(minor))
    throw Error("Exact historical amount unavailable")
  return generalMoney(minor, currency)
}
export async function readGeneralCatalogHistory(
  ctx: GeneralContext,
  input: z.infer<typeof generalCatalogHistoryInput>,
) {
  const { storeId } = requireGeneralScope(ctx)
  const caller = catalogRouter.createCaller(ctx).detail
  const scope = await orderScope(ctx, { storeId })
  const common = {
    itemId: input.itemId,
    cursor: input.cursor,
    storeId,
    limit: 10,
  }
  const page =
    input.mode === "orders"
      ? await caller.orders(common)
      : await caller.activity({ ...common, category: input.category })
  const inventoryAllowed =
    "inventoryAllowed" in page ? page.inventoryAllowed : undefined
  const asOf = new Date().toISOString()
  const label = `${ctx.tenantContext.activeStore?.name ?? "Current Store"} · Item ${input.itemId}`
  const answers: GeneralAnswer[] = [
    {
      id: `catalog_history_${crypto.randomUUID()}`,
      title: input.mode === "orders" ? "Item order lines" : "Item activity",
      value:
        input.mode === "activity" &&
        input.category === "stock" &&
        !inventoryAllowed
          ? "Unavailable"
          : `${page.items.length} on this page`,
      scope: label,
      asOf,
      detail: `${input.mode === "orders" ? "Order lines, not distinct orders" : `Activity category: ${input.category}`}. ${input.cursor ? "Continuation page" : "First page"}. ${page.nextCursor ? "More results available." : "End of this visible list."} Order facts follow ${scope.createdByUserId ? "your own sales" : "authorized order visibility"}; catalog price events are business-wide. ${inventoryAllowed === false ? "Stock activity is hidden by your inventory permission, not zero activity. " : ""}This page is not a total or a complete audit log.`,
    },
  ]
  for (const row of page.items) {
    if ("orderId" in row)
      answers.push({
        id: `catalog_order_${crypto.randomUUID()}`,
        title: row.orderNumber.slice(0, 160),
        value: `${row.quantity} ${row.unitName}`.slice(0, 240),
        scope: `${label} · Line ${row.id}`.slice(0, 500),
        asOf,
        detail:
          `${row.at} · ${row.status} · ${row.variantName}. Line total ${amount(row.totalMinor, row.currencyCode)}; unit price ${amount(row.unitPriceMinor, row.currencyCode)}. Original order snapshot; not current catalog pricing.`.slice(
            0,
            1000,
          ),
      })
    else
      answers.push({
        id: `catalog_event_${crypto.randomUUID()}`,
        title: row.title.slice(0, 160),
        value: row.at,
        scope: label,
        asOf,
        detail:
          `${row.description}. Actor: ${row.actorName ?? "not recorded"}. ${row.orderNumber ? `Order ${row.orderNumber}. ` : ""}${row.amountMinor !== null ? `Recorded amount ${amount(row.amountMinor, row.currencyCode)}. ` : ""}Event ${row.key}.`.slice(
            0,
            1000,
          ),
      })
  }
  return { page, answers }
}
