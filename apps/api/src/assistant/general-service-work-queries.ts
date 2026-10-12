import { serviceWorkLifecycleAction } from "@ewatrade/assistant/general/service-work"
import { serviceWorkRecordAction } from "@ewatrade/assistant/general/service-work-records"
import { serviceWorkCompletionAction } from "@ewatrade/assistant/general/service-work-completion"
import { serviceWorkCompletion } from "./general-service-work-completion"
import { readServiceWorkEditorContextInTransaction } from "@ewatrade/db/service-work-editor-context"
import {
  getServiceWorkOriginalInTransaction,
  type ServiceWorkOriginalTarget,
} from "@ewatrade/db/service-work-original"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import { CatalogError } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { requireGeneralScope, type GeneralContext } from "./general-context"
import { serviceWorkLifecycle } from "./general-service-work"
import { serviceWorkRecords } from "./general-service-work-records"

const id = z.string().trim().min(1).max(128)
export const serviceWorkEditorContextInput = z
  .object({ jobId: id, lineId: id.optional() })
  .strict()
export const serviceWorkReviewInput = z.union([
  serviceWorkLifecycleAction,
  serviceWorkRecordAction,
  serviceWorkCompletionAction,
])

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
const snapshot = {
  isolationLevel: "RepeatableRead" as const,
  maxWait: 10_000,
  timeout: 30_000,
}

export function readGeneralServiceWorkEditorContext(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = serviceWorkEditorContextInput.parse(raw)
  const scope = requireGeneralScope(ctx)
  return operation(() =>
    ctx.db.$transaction(
      (tx) =>
        readServiceWorkEditorContextInTransaction(tx, {
          ...input,
          actorUserId: scope.userId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
        }),
      snapshot,
    ),
  )
}

/** Pure preparation; native execution belongs only to signed GENERAL decisions. */
export function reviewGeneralServiceWork(ctx: GeneralContext, raw: unknown) {
  const input = serviceWorkReviewInput.parse(raw)
  const scope = requireGeneralScope(ctx)
  return operation(() =>
    ctx.db.$transaction(async (tx) => {
      const fresh = { ...ctx, db: tx }
      const review =
        input.action === "service_work_note" ||
        input.action === "service_work_exception"
          ? await serviceWorkRecords.review(fresh, input)
          : input.action === "service_work_rework" ||
              input.action === "service_work_handoff"
            ? await serviceWorkCompletion.review(fresh, input)
            : await serviceWorkLifecycle.review(fresh, input)
      return {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        actorUserId: scope.userId,
        jobId: input.jobId,
        lineId: "lineId" in input ? (input.lineId ?? null) : null,
        ...review,
      }
    }, snapshot),
  )
}

export function readGeneralServiceWorkOriginal(
  ctx: GeneralContext,
  input: ServiceWorkOriginalTarget,
) {
  const scope = requireGeneralScope(ctx)
  return operation(() =>
    ctx.db.$transaction(
      (tx) =>
        getServiceWorkOriginalInTransaction(tx, {
          ...input,
          actorUserId: scope.userId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
        }),
      snapshot,
    ),
  )
}
