import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { fulfillCommercialOrderProductLineInTransaction, getCommercialProductLineReview } from "@ewatrade/db/queries"
import type { GeneralActionAdapter, GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"
type ProductAction = Extract<GeneralAction, { action: "product_line_fulfill" }>
async function current(ctx: GeneralTransactionContext, payload: ProductAction) {
  const scope = requireGeneralScope(ctx)
  const review = await getCommercialProductLineReview(ctx.db, { ...scope, orderLineId: payload.orderLineId })
  return { scope, review, target: { id: review.orderLineId, revision: review.revision } }
}
async function execute(ctx: GeneralTransactionContext, payload: ProductAction, key: string, prepared?: Awaited<ReturnType<typeof current>>) {
  const { scope, review } = prepared ?? await current(ctx, payload)
  await fulfillCommercialOrderProductLineInTransaction(ctx.db, {
    tenantId: scope.tenantId, storeId: scope.storeId, actorUserId: scope.userId,
    orderLineId: payload.orderLineId, reason: payload.reason, clientOperationId: key,
    schemaVersion: 1, expectedReviewRevision: review.revision,
  })
  return {
    kind: "order" as const, recordId: review.orderId, title: "Product fulfilment recorded",
    detail: `${review.orderNumber} · ${review.productName} · ${review.offeringName} · ${review.quantity}. Reserved stock consumed; order completion follows all saved lines.`,
  }
}
export const productLineFulfill = {
  stale: "Product stock or cost evidence changed. Review fulfilment again.",
  unavailable: "This Product line cannot be fulfilled now.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return { target: prepared.target, execute: (key) => execute(ctx, payload, key, prepared) }
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    const cost = review.cost
    return { target, lines: [
      `${review.orderNumber} · ${review.productName} · ${review.offeringName} · full saved quantity ${review.quantity}.`,
      `Stock: ${review.stock.onHandBefore} → ${review.stock.onHandAfter} ${review.stock.unitName}. Reserved: ${review.stock.reservedBefore} → ${review.stock.reservedAfter}.`,
      cost.status === "NO_FINANCE_BOOK" ? "No Finance Book: physical fulfilment only; no financial valuation recorded." : cost.valueDeltaMinor === null ? `Cost is unknown (${cost.unknownReason ?? "missing evidence"}); it will not be invented.` : `Inventory value change: ${generalMoney(cost.valueDeltaMinor, cost.currencyCode)}.`,
      ...(review.scheduledFor ? [`Scheduled for ${review.scheduledFor.toISOString()}.`] : []),
      "Only this saved line is fulfilled. Order completion is derived from all lines. The server records the performance time.",
      `Reason: ${payload.reason}`,
    ] }
  },
  execute,
} satisfies GeneralActionAdapter<ProductAction>
