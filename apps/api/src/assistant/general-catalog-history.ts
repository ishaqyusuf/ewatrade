import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { z } from "zod"
import { catalogActivitySchema } from "../schemas/catalog-detail"
import { orderScope } from "../trpc/order-scope"
import { createGeneralDomainCaller } from "./general-callers"
import { generalCatalogActivityAnswer } from "./general-catalog-history-answer"
import { type GeneralContext, requireGeneralScope } from "./general-context"

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

function quantityValue(quantity: string, unit: string) {
  const prefix = `${quantity} `
  if (prefix.length > 150) throw Error("Exact historical quantity unavailable")
  if (prefix.length + unit.length <= 160) return `${prefix}${unit}`
  let shortened = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(unit)) {
    if (prefix.length + shortened.length + segment.length > 159) break
    shortened += segment
  }
  return `${prefix}${shortened}…`
}

export async function readGeneralCatalogHistory(
  ctx: GeneralContext,
  input: z.infer<typeof generalCatalogHistoryInput>,
) {
  const { tenantId, storeId } = requireGeneralScope(ctx)
  const caller = createGeneralDomainCaller(ctx).catalog.detail
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
  const label = `${ctx.tenantContext.activeStore?.name ?? "Current Store"} · item history`
  const answers: GeneralAnswer[] = [
    {
      id: `catalog_history_${crypto.randomUUID()}`,
      target: {
        kind: "catalog_item",
        catalogItemId: input.itemId,
        origin: { tenantId, storeId },
      },
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
        target: {
          kind: "order",
          orderId: row.orderId,
          origin: { tenantId, storeId },
        },
        title: row.orderNumber.slice(0, 160),
        value: quantityValue(row.quantity, row.unitName),
        scope: label.slice(0, 500),
        asOf,
        detail:
          `${row.at} · ${row.status} · ${row.variantName}. Line total ${amount(row.totalMinor, row.currencyCode)}; unit price ${amount(row.unitPriceMinor, row.currencyCode)}. Original order snapshot; not current catalog pricing. Long unit labels may be shortened; quantity is exact.`.slice(
            0,
            1000,
          ),
      })
    else
      answers.push(
        generalCatalogActivityAnswer(row, {
          tenantId,
          storeId,
          itemId: input.itemId,
          storeName: ctx.tenantContext.activeStore?.name ?? "Current Store",
          asOf,
        }),
      )
  }
  return { page, answers }
}
