import { generalMoney, type GeneralAction } from "@ewatrade/assistant/general/contracts"
import { getCommercialProductReturnImpactReview, resolveOrderScope, returnCommercialOrderProductLineInTransaction } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type { GeneralActionAdapter, GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"

type ReturnAction = Extract<GeneralAction, { action: "product_line_return" }>
async function current(ctx: GeneralTransactionContext, payload: ReturnAction) {
  const scope = requireGeneralScope(ctx)
  const visibility = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId, storeId: scope.storeId, activeStoreId: scope.storeId,
    userId: scope.userId, role: ctx.tenantContext.membership.role,
    allowedStoreIds: ctx.tenantContext.stores.map(store => store.id),
  })
  const visible = await ctx.db.commercialOrderLine.findFirst({
    where: { id: payload.orderLineId, order: visibility },
    select: { order: { select: {
      acceptedCommerceQuoteVersion: { select: { quote: { select: { sourceType: true } } } },
      prescriptionPickupFulfillment: { select: { orderId: true } },
      prescriptionDeliveryAssignment: { select: { orderId: true } },
    } } },
  })
  if (!visible) throw new TRPCError({ code: "NOT_FOUND", message: "Order item not found." })
  if (visible.order.acceptedCommerceQuoteVersion?.quote.sourceType === "PRESCRIPTION_REQUEST" ||
      visible.order.prescriptionPickupFulfillment || visible.order.prescriptionDeliveryAssignment)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Prescription returns require their clinical workflow." })
  const review = await getCommercialProductReturnImpactReview(ctx.db, {
    tenantId: scope.tenantId, storeId: scope.storeId, orderLineId: payload.orderLineId,
    quantity: payload.quantity, disposition: payload.disposition,
    destinationBalanceSourceId: payload.destinationBalanceSourceId,
  })
  return { scope, review, target: { id: review.orderLineId, revision: review.impactRevision } }
}
async function execute(ctx: GeneralTransactionContext, payload: ReturnAction, key: string, prepared?: Awaited<ReturnType<typeof current>>) {
  const { scope, review } = prepared ?? await current(ctx, payload)
  await returnCommercialOrderProductLineInTransaction(ctx.db, {
    tenantId: scope.tenantId, storeId: scope.storeId, actorUserId: scope.userId,
    orderLineId: payload.orderLineId, quantity: payload.quantity, disposition: payload.disposition,
    destinationBalanceSourceId: payload.destinationBalanceSourceId, reason: payload.reason,
    clientReturnId: key, schemaVersion: 1, expectedReviewRevision: review.impactRevision,
  })
  return {
    kind: "order" as const, recordId: review.orderId, title: "Product return recorded",
    detail: `${review.orderNumber} · ${review.productName} · ${review.quantities.quantity} · ${payload.disposition.replaceAll("_", " ")}. No customer credit or cash refund recorded.`,
  }
}
export function productReturnReviewLines(review: Awaited<ReturnType<typeof getCommercialProductReturnImpactReview>>, reason: string) {
  const money = (minor: string) => generalMoney(minor, review.currencyCode)
  const journal = review.journal
  return [
    `${review.orderNumber} · ${review.productName} · ${review.offeringName} · return ${review.quantities.quantity}.`,
    `Fulfilled: ${review.quantities.fulfilledQuantity}. Previously returned: ${review.quantities.returnedQuantity}. Returnable: ${review.quantities.returnableBefore} → ${review.quantities.returnableAfter}.`,
    `Disposition: ${review.disposition.replaceAll("_", " ")}.`,
    review.stock ? `Stock: ${review.stock.onHandBefore} → ${review.stock.onHandAfter} ${review.stock.unitName}. Reserved: ${review.stock.reservedBefore} → ${review.stock.reservedAfter}.` : "Physical stock is unchanged.",
    review.originalCost.status === "NO_FINANCE_BOOK" ? "No Finance Book: no financial valuation recorded." : review.originalCost.sourceCostMinor === null ? `Original cost is unknown (${review.originalCost.unknownReason ?? "missing evidence"}).` : `Original returned-item cost: ${money(review.originalCost.sourceCostMinor)}.`,
    ...(review.destination ? [review.destination.valueAfterMinor === null ? `Destination stock value remains unknown (${review.destination.unknownReason ?? "missing evidence"}).` : `Destination stock value after return: ${money(review.destination.valueAfterMinor)}.`] : []),
    journal.status === "WILL_POST" ? `Inventory debit / cost of sales credit: ${money(journal.amountMinor)}.` : `No inventory/COGS journal will post now: ${journal.status.toLowerCase().replaceAll("_", " ")}.`,
    "No customer credit or cash refund is recorded. The server records the return time.",
    `Reason: ${reason}`,
  ]
}
export const productLineReturn = {
  stale: "Return quantities, stock or cost evidence changed. Review the return again.",
  unavailable: "This Product line cannot be returned now.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return { target: prepared.target, execute: key => execute(ctx, payload, key, prepared) }
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: productReturnReviewLines(review, payload.reason) }
  },
  execute,
} satisfies GeneralActionAdapter<ReturnAction>
