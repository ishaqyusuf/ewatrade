import {
  serviceWorkLifecycleAction,
  serviceWorkLifecycleReceipt,
  type ServiceWorkLifecycleAction,
} from "@ewatrade/assistant/general/service-work"
import {
  prepareReviewedServiceWorkInTransaction,
  type ServiceWorkReviewInput,
} from "@ewatrade/db/service-work-review"
import { CatalogError } from "@ewatrade/db/queries"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
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
  value: ServiceWorkLifecycleAction,
) {
  const payload = serviceWorkLifecycleAction.parse(value)
  const scope = requireGeneralScope(ctx)
  const common = {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
    jobId: payload.jobId,
    reason: payload.reason,
  }
  const input: ServiceWorkReviewInput =
    payload.action === "service_job_assign"
      ? {
          ...common,
          operation: "assign",
          assigneeUserId: payload.assigneeUserId,
        }
      : payload.action === "service_job_reschedule"
        ? {
            ...common,
            operation: "reschedule",
            promisedAt: new Date(payload.promisedAt),
            reason: payload.reason,
          }
        : {
            ...common,
            operation: "transition",
            lineId: payload.lineId,
            toStatus: payload.toStatus,
          }
  return operation(() => prepareReviewedServiceWorkInTransaction(ctx.db, input))
}
function receipt(
  prepared: Awaited<ReturnType<typeof current>>,
  result: Awaited<ReturnType<typeof prepared.execute>>,
) {
  const { review } = prepared
  const title =
    review.operation === "assign"
      ? "Work assignment recorded"
      : review.operation === "reschedule"
        ? "Promised time revised"
        : "Work progress recorded"
  return serviceWorkLifecycleReceipt.parse({
    kind: "service_work",
    recordId: result.job.id,
    eventId: result.event.id,
    eventType: result.event.type,
    recordedAt: result.event.createdAt.toISOString(),
    effectiveAt: result.event.effectiveAt.toISOString(),
    title,
    detail: `${review.orderNumber} · ${review.line?.offeringName ?? "Service Job"}. Saved work history retained.`,
  })
}
/** Root registers these source-only handlers after reviewing capability and receipt contracts. */
export const serviceWorkLifecycle = {
  stale:
    "The saved work, authority, assignment or customer-reminder settings changed. Review again.",
  unavailable: "This Service Job or line is unavailable at the current Store.",
  async validate(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkLifecycleAction,
  ) {
    return (await current(ctx, payload)).target
  },
  async review(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkLifecycleAction,
  ) {
    const { review, target } = await current(ctx, payload)
    return {
      target,
      lines: [
        `${review.orderNumber} · ${review.customerName ?? "Service customer"}`,
        ...(review.line
          ? [
              `${review.line.offeringName} · ${review.line.variantName} · ${review.line.quantity}. Current work: ${review.line.status}. Authorization: ${review.line.authorizationStatus}.`,
              `Next work state: ${review.nextStatus}.`,
            ]
          : []),
        ...(review.assignee
          ? [
              `Assign to ${review.assignee.name ?? "selected saved staff member"}. Assignment history is retained.`,
            ]
          : []),
        ...(review.promisedAt
          ? [
              `Current promise: ${review.currentPromise ?? "None"}. New promise: ${review.promisedAt}.`,
              `${review.replacedReminderCount} outstanding due reminder(s) will be replaced or cancelled.`,
              review.reminder
                ? `Customer ${review.reminder.channel} reminder scheduled for ${review.reminder.scheduledFor}; provider delivery is separate.`
                : "No new customer reminder will be created.",
            ]
          : []),
        ...(review.reason ? [`Reason: ${review.reason}`] : []),
        `Order balance: ${generalMoney(review.balanceDueMinor, review.currencyCode)}.`,
        "No payment or handoff is recorded. Work history retains the original event identity.",
      ],
    }
  },
  async prepareExecution(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkLifecycleAction,
  ) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: async (key: string) =>
        receipt(prepared, await operation(() => prepared.execute(key))),
    }
  },
  async execute(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkLifecycleAction,
    key: string,
  ) {
    const prepared = await current(ctx, payload)
    return receipt(prepared, await operation(() => prepared.execute(key)))
  },
}
