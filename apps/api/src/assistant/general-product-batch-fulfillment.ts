import { generalMoney, type GeneralAction } from "@ewatrade/assistant/general/contracts"
import { CatalogError, fulfillCommercialOrderProductsInTransaction, getCommercialProductBatchReview } from "@ewatrade/db/queries"
import { conflict, type GeneralActionAdapter, type GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"

type BatchAction = Extract<GeneralAction, { action: "product_batch_fulfill" }>
async function current(ctx: GeneralTransactionContext, payload: BatchAction) {
  const scope = requireGeneralScope(ctx)
  const review = await getCommercialProductBatchReview(ctx.db, { ...scope, orderId: payload.orderId })
  return { scope, review, target: { id: review.orderId, revision: review.revision } }
}
async function execute(ctx: GeneralTransactionContext, payload: BatchAction, key: string, expectedRevision?: string) {
  const scope = requireGeneralScope(ctx)
  const revision = expectedRevision ?? (await current(ctx, payload)).review.revision
  const result = await fulfillCommercialOrderProductsInTransaction(ctx.db, {
    tenantId: scope.tenantId, storeId: scope.storeId, actorUserId: scope.userId,
    orderId: payload.orderId, reason: payload.reason, clientOperationId: key,
    schemaVersion: 1, expectedReviewRevision: revision,
  }).catch(error => {
    if (error instanceof CatalogError && error.code === "REVISION_CONFLICT")
      throw conflict("Order lines, stock or cost evidence changed. Review fulfilment again.")
    throw error
  })
  return {
    kind: "order" as const, recordId: payload.orderId, title: "Order fulfilment recorded",
    detail: `${result.fulfilledLineCount} lines fulfilled. Order status: ${result.status}.`,
  }
}
export const productBatchFulfill = {
  stale: "Order lines, stock or cost evidence changed. Review fulfilment again.",
  unavailable: "This Order cannot be fulfilled now.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async prepareExecution(ctx, payload, execution) {
    // The signed proposal supplies this digest. The canonical command validates
    // it under financial/Order/reservation/balance locks before its first write.
    // Avoid reading the same expensive graph once here and again under locks.
    return {
      target: { id: payload.orderId, revision: execution.expectedReviewDigest },
      execute: key => execute(ctx, payload, key, execution.expectedReviewDigest),
    }
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: [
      `${review.orderNumber} · remaining product and catalog-free lines at full saved quantities.`,
      ...review.products.map(line => `${line.productName} · ${line.offeringName} · quantity ${line.quantity}.`),
      ...review.services.map(line => `Record service performance: ${line.offeringName} · quantity ${line.quantity}; no physical stock change.`),
      ...review.balances.flatMap(balance => [
        `Stock: ${balance.onHandBefore} → ${balance.onHandAfter} ${balance.unitName}. Reserved: ${balance.reservedBefore} → ${balance.reservedAfter}.`,
        balance.costStatus === "NO_FINANCE_BOOK" ? "No Finance Book: no financial valuation recorded."
          : balance.valueDeltaMinor === null ? `Cost is unknown (${balance.unknownReason ?? "missing evidence"}).`
          : `Inventory value change: ${generalMoney(balance.valueDeltaMinor, balance.currencyCode)}.`,
      ]),
      "Other service work is excluded. Completion is derived from all saved lines; execution time is recorded by the server. This does not record payment or a manager release.",
      `Reason: ${payload.reason}`,
    ] }
  },
  execute,
} satisfies GeneralActionAdapter<BatchAction>
