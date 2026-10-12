import type { GeneralStaffAccessAction } from "@ewatrade/assistant/general/staff-access"
import {
  prepareReviewedStaffAccessUpdateInTransaction,
  reviewStaffAccessUpdateInTransaction,
  type StaffAccessUpdateReview,
} from "@ewatrade/db/staff-access-update"
import {
  STAFF_STORE_ACCESS_ROLLOUT_READY,
  StaffStoreAccessError,
} from "@ewatrade/db/staff-store-access"
import { TRPCError } from "@trpc/server"
import type {
  GeneralTransactionContext,
  ProposalTarget,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

export async function staffAccessOperation<T>(operation: () => Promise<T>) {
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
export function assertStaffAccessWriteReady(ready: boolean) {
  if (!ready)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Staff Store access rollout is not ready. Access changes are temporarily unavailable.",
    })
}
function inputFor(
  ctx: GeneralTransactionContext,
  payload: GeneralStaffAccessAction,
) {
  const scope = requireGeneralScope(ctx)
  if (!["OWNER", "ADMIN"].includes(ctx.tenantContext.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Owner/Admin access is required for Store staff grants.",
    })
  return {
    ...payload,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
  }
}
function target(review: StaffAccessUpdateReview): ProposalTarget {
  return { id: review.membershipId, revision: review.reviewHash }
}
export function staffAccessReviewLines(review: StaffAccessUpdateReview) {
  return [
    `${review.name} · ${review.email} · business membership. Access revision ${review.expectedRevision}.`,
    `Access mode: ${review.before.accessMode} → SCOPED. Membership ${review.before.membershipStatus} and business role ${review.before.businessRole} remain unchanged.`,
    ...(review.diff.comparison === "legacy_business_wide_not_enumerated"
      ? [
          "Explicit legacy cutover replaces business-wide access. Recorded Store rows do not enumerate every legacy privilege.",
        ]
      : []),
    ...review.diff.added.map((row) => `Add ${row.storeName} · ${row.role}.`),
    ...review.diff.removed.map(
      (row) => `Remove ${row.storeName ?? "Unavailable Store"} · ${row.role}.`,
    ),
    ...review.diff.changed.map(
      (row) => `${row.storeName}: ${row.previousRole} → ${row.nextRole}.`,
    ),
    ...review.after.assignments.map(
      (row) =>
        `${row.storeName} · ${row.role}${row.storeId === review.after.defaultStoreId ? " · starting Store" : ""}.`,
    ),
    ...(review.after.assignments.length
      ? []
      : ["Remove every Store grant; this does not suspend the membership."]),
    `Catalog editing: ${review.diff.catalog.before ? "allowed" : "not allowed"} → ${review.diff.catalog.after ? "allowed" : "not allowed"}.`,
    review.impact,
    review.outstandingServiceWork.detail,
    "Original reason and handover are not recorded by this access command.",
  ]
}
async function prepare(
  ctx: GeneralTransactionContext,
  payload: GeneralStaffAccessAction,
) {
  assertStaffAccessWriteReady(STAFF_STORE_ACCESS_ROLLOUT_READY)
  const prepared = await staffAccessOperation(() =>
    prepareReviewedStaffAccessUpdateInTransaction(
      ctx.db,
      inputFor(ctx, payload),
    ),
  )
  return {
    target: target(prepared.review),
    execute: async (_key: string) => {
      const saved = await staffAccessOperation(() => prepared.execute())
      return {
        kind: "staff_access" as const,
        recordId: saved.accessEventId,
        title: "Staff Store access updated",
        detail: `${prepared.review.name}: original access revision ${saved.revision}, ${prepared.review.after.assignments.length} Store grant(s). Membership status and business role remain unchanged; reason and handover are not recorded.`,
      }
    },
  }
}

// Registered by the parent only after strict contracts and receipt dispatch are integrated.
export const staffAccess = {
  stale:
    "The staff access, Store availability or original review changed. Review again.",
  unavailable: "This staff access cannot be changed now.",
  async validate(
    ctx: GeneralTransactionContext,
    payload: GeneralStaffAccessAction,
    _lock: boolean,
  ) {
    return target(
      await staffAccessOperation(() =>
        reviewStaffAccessUpdateInTransaction(ctx.db, inputFor(ctx, payload)),
      ),
    )
  },
  async review(
    ctx: GeneralTransactionContext,
    payload: GeneralStaffAccessAction,
  ) {
    const review = await staffAccessOperation(() =>
      reviewStaffAccessUpdateInTransaction(ctx.db, inputFor(ctx, payload)),
    )
    return { target: target(review), lines: staffAccessReviewLines(review) }
  },
  prepareExecution: prepare,
  async execute(
    ctx: GeneralTransactionContext,
    payload: GeneralStaffAccessAction,
    key: string,
  ) {
    return (await prepare(ctx, payload)).execute(key)
  },
}
