import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  authorizeCommercialOrderChargeOnlyServiceLineInTransaction,
  fulfillCommercialOrderChargeOnlyServiceLineInTransaction,
  getCommercialServiceLineReview,
} from "@ewatrade/db/queries"
import { conflict, type GeneralActionAdapter, type GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"

type ServiceAction = Extract<GeneralAction, { action: "service_line_authorize" | "service_line_fulfill" }>
async function current(ctx: GeneralTransactionContext, payload: ServiceAction) {
  const scope = requireGeneralScope(ctx)
  const review = await getCommercialServiceLineReview(ctx.db, {
    ...scope,
    orderLineId: payload.orderLineId,
    action: payload.action === "service_line_authorize" ? "authorize" : "fulfill",
  })
  if (!review.eligible) throw conflict(review.blocker?.message ?? "This service line is unavailable.")
  return { scope, review, target: { id: review.orderLineId, revision: review.revision } }
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: ServiceAction,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { scope, review } = prepared ?? await current(ctx, payload)
  const input = {
    tenantId: scope.tenantId, storeId: scope.storeId, actorUserId: scope.userId,
    orderLineId: payload.orderLineId, clientOperationId: key, schemaVersion: 1,
    reason: payload.reason, expectedReviewRevision: review.revision,
  }
  // Canonical commands acquire locks, reread authority and compare the evidence
  // before writing. The caller owns the transaction containing the receipt.
  if (payload.action === "service_line_authorize")
    await authorizeCommercialOrderChargeOnlyServiceLineInTransaction(ctx.db, input)
  else
    await fulfillCommercialOrderChargeOnlyServiceLineInTransaction(ctx.db, input)
  return {
    kind: "order" as const,
    recordId: review.orderId,
    title: payload.action === "service_line_authorize" ? "Service release recorded" : "Service performance recorded",
    detail: `${review.orderNumber} · ${review.offeringName ?? "Service"} · ${review.quantity}. Physical stock is unchanged.`,
  }
}
export const serviceLineAction = {
  stale: "Service eligibility or payment evidence changed. Review this action again.",
  unavailable: "This service line is unavailable for the requested action.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return { target: prepared.target, execute: (key) => execute(ctx, payload, key, prepared) }
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: [
      `${review.orderNumber} · ${review.offeringName ?? "Service"}`,
      `Full saved quantity: ${review.quantity}.`,
      payload.action === "service_line_authorize" ? "Record manager release only. Service performance remains a separate action." : "Record service performance now. Order completion is derived from all saved lines.",
      `Authorization: ${review.authorizationPolicy?.replaceAll("_", " ")}.`,
      `Order balance: ${review.payment.currencyCode} ${(review.payment.balanceDueMinor / 100).toFixed(2)}.`,
      ...(review.scheduledFor ? [`Scheduled for ${review.scheduledFor.toISOString()}.`] : []),
      "No physical stock movement. Performance time is recorded by the server.",
      `Reason: ${payload.reason}`,
    ] }
  },
  execute,
} satisfies GeneralActionAdapter<ServiceAction>
