import {
  type ServiceWorkRecordAction,
  serviceWorkRecordAction,
  serviceWorkRecordReceipt,
} from "@ewatrade/assistant/general/service-work-records"
import { CatalogError } from "@ewatrade/db/queries"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import {
  type ServiceWorkRecordReviewInput,
  prepareReviewedServiceWorkRecordInTransaction,
} from "@ewatrade/db/service-work-record-review"
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
  raw: ServiceWorkRecordAction,
) {
  const payload = serviceWorkRecordAction.parse(raw)
  const scope = requireGeneralScope(ctx)
  const common = {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
    jobId: payload.jobId,
    lineId: payload.lineId,
  }
  const input: ServiceWorkRecordReviewInput =
    payload.action === "service_work_note"
      ? { ...common, operation: "note", body: payload.body }
      : {
          ...common,
          operation: "exception",
          type: payload.type,
          description: payload.description,
        }
  return operation(() =>
    prepareReviewedServiceWorkRecordInTransaction(ctx.db, input),
  )
}
type Prepared = Awaited<ReturnType<typeof current>>
async function execute(prepared: Prepared, key: string) {
  const result = await operation(() => prepared.execute(key))
  const original = result.original
  const common = {
    recordId: original.id,
    jobId: original.serviceJobId,
    lineId: original.serviceJobLineId,
    recordedAt: original.createdAt.toISOString(),
    title:
      result.recordType === "note"
        ? "Internal work note recorded"
        : "Work exception recorded",
    detail: `${prepared.review.orderNumber} · ${prepared.review.line?.offeringName ?? "Service Job"}. ${result.recordType === "note" ? "Internal note; work state unchanged." : "Open exception; work state unchanged."}`,
  }
  return serviceWorkRecordReceipt.parse(
    result.recordType === "note"
      ? { ...common, kind: "service_work_note" }
      : {
          ...common,
          kind: "service_work_exception",
          exceptionType: result.original.type,
          outcome: result.original.outcome,
          occurredAt: result.original.occurredAt.toISOString(),
        },
  )
}
/** Source-only until coordinator registers the exact intentions and owning-record receipt. */
export const serviceWorkRecords = {
  stale:
    "The saved work, selected line or current authority changed. Review this record again.",
  unavailable:
    "This saved Service Job or line is unavailable at the current Store.",
  async validate(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkRecordAction,
  ) {
    return (await current(ctx, payload)).target
  },
  async review(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkRecordAction,
  ) {
    const { review, target } = await current(ctx, payload)
    return {
      target,
      lines: [
        `${review.orderNumber} · ${review.customerName ?? "Service customer"}`,
        ...(review.line
          ? [
              `${review.line.offeringName} · ${review.line.variantName} · ${review.line.quantity}. Saved state: ${review.line.status}. Authorization: ${review.line.authorizationStatus}.`,
            ]
          : ["Record applies to the whole saved Job."]),
        ...(review.handedOffAt
          ? [
              `Handoff was already recorded at ${review.handedOffAt}; this record does not reopen work.`,
            ]
          : []),
        review.operation === "note"
          ? `Internal work note: ${review.text}`
          : `Open ${review.exceptionType?.replaceAll("_", " ")} exception: ${review.text}`,
        "This adds a private work record. Work/payment/handoff state stays unchanged; no customer notification or provider delivery occurs.",
      ],
    }
  },
  async prepareExecution(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkRecordAction,
  ) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key: string) => execute(prepared, key),
    }
  },
  async execute(
    ctx: GeneralTransactionContext,
    payload: ServiceWorkRecordAction,
    key: string,
  ) {
    return execute(await current(ctx, payload), key)
  },
}
