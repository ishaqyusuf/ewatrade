import type {
  GeneralReceipt,
  GeneralStaffRemovalAction,
} from "@ewatrade/assistant/general/contracts"
import {
  prepareReviewedStaffRemovalInTransaction,
  reviewStaffRemovalInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { staffStatusOperation } from "./general-staff-status"

type Review = Awaited<ReturnType<typeof reviewStaffRemovalInTransaction>>

function inputFor(
  ctx: GeneralTransactionContext,
  payload: GeneralStaffRemovalAction,
) {
  const scope = requireGeneralScope(ctx)
  if (!["OWNER", "ADMIN"].includes(ctx.tenantContext.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Owner/Admin access is required to remove staff through the assistant.",
    })
  return {
    membershipId: payload.membershipId,
    expectedRevision: payload.expectedRevision,
    reason: payload.reason,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  }
}
function target(review: Review) {
  return { id: review.membershipId, revision: review.reviewHash }
}
export function staffRemovalReviewLines(review: Review) {
  return [
    `${review.name} · ${review.email} · never joined.`,
    `${review.role} · ${review.status}. Current access revision ${review.expectedRevision}.`,
    `Reason: ${review.reason}.`,
    review.liveInviteLinks
      ? `${review.liveInviteLinks} live invite link(s) will stop working.`
      : "No live invite link.",
    review.impact,
  ]
}
async function prepare(
  ctx: GeneralTransactionContext,
  payload: GeneralStaffRemovalAction,
) {
  const prepared = await staffStatusOperation(() =>
    prepareReviewedStaffRemovalInTransaction(ctx.db, inputFor(ctx, payload)),
  )
  return {
    target: target(prepared.review),
    execute: async (_key: string) => {
      const saved = await staffStatusOperation(() => prepared.execute())
      return {
        kind: "staff_status",
        recordId: saved.lifecycleEventId,
        title: "Staff removed",
        detail: `${prepared.review.name} never joined and was removed. Reason: ${saved.reason}. Their invite links no longer work and their seat is free; they can be invited again.`,
      } satisfies GeneralReceipt
    },
  }
}
export const staffRemoval: GeneralActionAdapter<GeneralStaffRemovalAction> = {
  stale:
    "Their invite, status or access changed since the review. Review again.",
  unavailable: "This person can't be removed now.",
  async validate(ctx, payload) {
    return target(
      await staffStatusOperation(() =>
        reviewStaffRemovalInTransaction(ctx.db, inputFor(ctx, payload), {
          administrativeOnly: true,
        }),
      ),
    )
  },
  async review(ctx, payload) {
    const review = await staffStatusOperation(() =>
      reviewStaffRemovalInTransaction(ctx.db, inputFor(ctx, payload), {
        administrativeOnly: true,
      }),
    )
    return { target: target(review), lines: staffRemovalReviewLines(review) }
  },
  prepareExecution: prepare,
  async execute(ctx, payload, key) {
    return (await prepare(ctx, payload)).execute(key)
  },
}
