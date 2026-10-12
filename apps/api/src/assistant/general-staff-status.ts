import type {
  GeneralReceipt,
  GeneralStaffStatusAction,
} from "@ewatrade/assistant/general/contracts"
import {
  prepareReviewedStaffStatusChangeInTransaction,
  reviewStaffStatusChangeInTransaction,
} from "@ewatrade/db/queries"
import { StaffStoreAccessError } from "@ewatrade/db/staff-store-access"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type Review = Awaited<ReturnType<typeof reviewStaffStatusChangeInTransaction>>
export async function staffStatusOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof StaffStoreAccessError)
      throw new TRPCError({
        code: error.code === "INVALID_INPUT" ? "BAD_REQUEST" : error.code,
        message: error.message,
      })
    throw error
  }
}
function inputFor(
  ctx: GeneralTransactionContext,
  payload: GeneralStaffStatusAction,
) {
  const scope = requireGeneralScope(ctx)
  if (!["OWNER", "ADMIN"].includes(ctx.tenantContext.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Owner/Admin access is required for assistant staff status changes.",
    })
  return { ...payload, tenantId: scope.tenantId, actorUserId: scope.userId }
}
function target(review: Review) {
  return { id: review.membershipId, revision: review.reviewHash }
}
export function staffStatusReviewLines(review: Review) {
  return [
    `${review.name} · ${review.email} · whole business membership.`,
    `${review.role}: ${review.previousStatus} → ${review.nextStatus}. Current access revision ${review.expectedRevision}.`,
    `Reason: ${review.reason}.`,
    `Access mode: ${review.accessMode}. Catalog editing: ${review.catalogEditor ? "allowed" : "not allowed"}.`,
    ...review.assignments.map(
      (row) =>
        `${row.storeName} · ${row.role}${row.storeId === review.defaultStoreId ? " · starting Store" : ""} · current ${row.storeStatus.toLowerCase()} Store.`,
    ),
    review.impact,
    "Confirmation records the original status change and reason. It does not change Store grants, roles or historical ownership.",
  ]
}
async function prepare(
  ctx: GeneralTransactionContext,
  payload: GeneralStaffStatusAction,
) {
  const prepared = await staffStatusOperation(() =>
    prepareReviewedStaffStatusChangeInTransaction(
      ctx.db,
      inputFor(ctx, payload),
    ),
  )
  return {
    target: target(prepared.review),
    execute: async (_key: string) => {
      const saved = await staffStatusOperation(() => prepared.execute())
      return {
        kind: "staff_status",
        recordId: saved.lifecycleEventId,
        title:
          saved.status === "SUSPENDED"
            ? "Staff suspended"
            : "Staff reactivated",
        detail: `${prepared.review.name}: ${saved.previousStatus} → ${saved.status}. Reason: ${saved.reason}. This is the original whole-business status outcome; Store grants are preserved.`,
      } satisfies GeneralReceipt
    },
  }
}
export const staffStatus: GeneralActionAdapter<GeneralStaffStatusAction> = {
  stale:
    "The staff status, access, Store grants or original review changed. Review again.",
  unavailable: "This staff status cannot be changed now.",
  async validate(ctx, payload) {
    return target(
      await staffStatusOperation(() =>
        reviewStaffStatusChangeInTransaction(ctx.db, inputFor(ctx, payload), {
          administrativeOnly: true,
        }),
      ),
    )
  },
  async review(ctx, payload) {
    const review = await staffStatusOperation(() =>
      reviewStaffStatusChangeInTransaction(ctx.db, inputFor(ctx, payload), {
        administrativeOnly: true,
      }),
    )
    return { target: target(review), lines: staffStatusReviewLines(review) }
  },
  prepareExecution: prepare,
  async execute(ctx, payload, key) {
    return (await prepare(ctx, payload)).execute(key)
  },
}
