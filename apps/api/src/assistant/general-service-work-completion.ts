import {
  type ServiceWorkCompletionAction,
  serviceWorkCompletionAction,
  serviceWorkCompletionReceipt,
} from "@ewatrade/assistant/general/service-work-completion"
import { prepareReviewedServiceWorkCompletionInTransaction } from "@ewatrade/db/service-work-completion-review"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import { CatalogError } from "@ewatrade/db/queries"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import { TRPCError } from "@trpc/server"
import type { GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"

async function operation<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ServiceIntakeReviewError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    if (error instanceof CatalogError)
      throw new TRPCError({
        code: "CONFLICT",
        message: error.message,
        cause: error,
      })
    throw error
  }
}
async function current(
  ctx: GeneralTransactionContext,
  raw: ServiceWorkCompletionAction,
) {
  const payload = serviceWorkCompletionAction.parse(raw)
  const scope = requireGeneralScope(ctx)
  const common = {
    actorUserId: scope.userId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    jobId: payload.jobId,
  }
  return operation(() =>
    prepareReviewedServiceWorkCompletionInTransaction(
      ctx.db,
      payload.action === "service_work_rework"
        ? {
            ...common,
            operation: "rework",
            lineId: payload.lineId,
            quantity: payload.quantity,
            reason: payload.reason,
          }
        : { ...common, operation: "handoff", note: payload.note },
    ),
  )
}
type Prepared = Awaited<ReturnType<typeof current>>
async function execute(prepared: Prepared, key: string) {
  const result = await operation(() => prepared.execute(key))
  const rework = prepared.review.operation === "rework"
  return serviceWorkCompletionReceipt.parse({
    kind: "service_work",
    recordId: result.job.id,
    eventId: result.event.id,
    eventType: result.event.type,
    recordedAt: result.event.createdAt.toISOString(),
    effectiveAt: result.event.effectiveAt.toISOString(),
    sourceJobId: prepared.review.jobId,
    sourceLineId: prepared.review.sourceLineId,
    title: rework ? "Linked rework recorded" : "Customer handoff recorded",
    detail: `${prepared.review.orderNumber} · ${rework ? "New linked queued work; original completed work retained." : "Ready work collected with balance already settled."}`,
  })
}
/** Fresh preparation joins GENERAL signed confirmation and its atomic original receipt. */
export const serviceWorkCompletion = {
  stale:
    "The saved work, balance, source allocation or customer-update state changed. Review again.",
  unavailable: "This exact work cannot be completed with current Store access.",
  async validate(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkCompletionAction,
  ) {
    return (await current(ctx, payload)).target
  },
  async review(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkCompletionAction,
  ) {
    const { review, target } = await current(ctx, payload)
    return {
      target,
      lines: [
        `${review.orderNumber} · ${review.customerName ?? "Service customer"}`,
        ...review.lines.map(
          (line) =>
            `${line.offeringName} · ${line.variantName} · ${line.quantity}. Current work: ${line.status}. Authorization: ${line.authorizationStatus}.`,
        ),
        review.operation === "rework"
          ? `Create ${review.quantity} new linked queued authorized work. Completed original Job/Line and prior handoff remain unchanged; no new sale or payment is recorded.`
          : `Record customer collection of this saved Job. The balance is already settled; ${review.cancelledDueReminderCount} outstanding due reminder(s) will be cancelled atomically. Other Order obligations still use their original completion rules.`,
        ...(review.sourceHandedOffAt
          ? [`Original source handoff: ${review.sourceHandedOffAt}.`]
          : []),
        ...(review.reason
          ? [
              `${review.operation === "rework" ? "Reason" : "Handoff note"}: ${review.reason}`,
            ]
          : []),
        `Order balance: ${generalMoney(review.balanceDueMinor, review.currencyCode)}.`,
        "No customer update or provider delivery is created. Original history identity and stored times are retained.",
      ],
    }
  },
  async prepareExecution(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkCompletionAction,
  ) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key: string) => execute(prepared, key),
    }
  },
  async execute(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkCompletionAction,
    key: string,
  ) {
    return execute(await current(ctx, payload), key)
  },
}
