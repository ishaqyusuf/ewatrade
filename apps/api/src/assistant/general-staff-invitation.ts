import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import {
  StaffInvitationCommandError,
  prepareReviewedStaffInvitationCommandInTransaction,
  reviewStaffInvitationCommandInTransaction,
} from "@ewatrade/db/queries"
import { StaffStoreAccessError } from "@ewatrade/db/staff-store-access"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type Action = Extract<GeneralAction, { action: "staff_invitation" }>
type Review = Awaited<
  ReturnType<typeof reviewStaffInvitationCommandInTransaction>
>
async function commandOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof StaffInvitationCommandError)
      throw new TRPCError({ code: error.code, message: error.message })
    if (error instanceof StaffStoreAccessError)
      throw new TRPCError({
        code: error.code === "INVALID_INPUT" ? "BAD_REQUEST" : error.code,
        message: error.message,
      })
    throw error
  }
}
function inputFor(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  if (!["OWNER", "ADMIN"].includes(ctx.tenantContext.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Owner/Admin staff access is required.",
    })
  return {
    ...payload.intent,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  }
}
function target(review: Review) {
  return {
    id:
      review.kind === "INVITE"
        ? `staff-email:${review.recipient.email}`
        : review.invitationId,
    revision: review.reviewHash,
  }
}
function assertReviewAvailable(review: Review) {
  if (review.blockers.length)
    throw new TRPCError({
      code: "CONFLICT",
      message: review.blockers.map((b) => b.message).join(" "),
    })
  return review
}
export function staffInvitationReviewLines(review: Review) {
  const grants = review.kind === "INVITE" ? review.proposed : review.current
  return [
    `${review.kind === "INVITE" ? "Invite" : review.kind === "RESEND" ? "Resend invitation to" : "Revoke invitation for"} ${review.recipient.name ? `${review.recipient.name} · ` : ""}${review.recipient.email}.`,
    `Business membership: ${grants.role} · INVITED. Onboarding is required; this does not activate staff or create credentials.`,
    ...grants.assignments.map(
      (a) =>
        `${a.storeName} (${a.storeId}) · ${a.role}${a.storeId === grants.defaultStoreId ? " · starting Store" : ""}.`,
    ),
    `Catalog editing: ${grants.catalogEditor ? "allowed" : "not allowed"}.`,
    ...(review.kind === "INVITE"
      ? [
          `Staff seats: ${review.seats.used} used of ${review.seats.limit ?? "unlimited"}; this invitation needs ${review.seats.additional} additional seat(s).`,
        ]
      : [`Reason: ${review.reason}.`, review.effect]),
    review.kind === "REVOKE"
      ? "Membership stays INVITED and its seat stays counted. An email already sending may arrive with an invalid link."
      : "Confirmation saves an invitation and requests one invitation email. Saved or queued does not mean sent, delivered or accepted.",
  ]
}
async function prepareStaffInvitation(
  ctx: GeneralTransactionContext,
  payload: Action,
) {
  const prepared = await commandOperation(() =>
    prepareReviewedStaffInvitationCommandInTransaction(
      ctx.db,
      inputFor(ctx, payload),
    ),
  )
  return {
    target: target(prepared.review),
    execute: async (key: string) => {
      const saved = await commandOperation(() => prepared.execute(key))
      return {
        kind: "staff_invitation",
        recordId: saved.commandId,
        title:
          saved.kind === "REVOKE"
            ? "Invitation revoked"
            : saved.kind === "RESEND"
              ? "Replacement invitation saved"
              : "Staff invitation saved",
        detail: `${prepared.review.recipient.email} · ${saved.kind === "REVOKE" ? "Link revoked; unsent work cancelled. Membership stays INVITED." : "Invitation email requested; delivery and acceptance are separate."}`,
      } satisfies GeneralReceipt
    },
  }
}

export const staffInvitation: GeneralActionAdapter<Action> = {
  stale:
    "The recipient, invitation, Store grants, staff access or seat availability changed. Review again.",
  unavailable: "This staff invitation cannot be saved now.",
  async validate(ctx, payload) {
    return target(
      assertReviewAvailable(
        await commandOperation(() =>
          reviewStaffInvitationCommandInTransaction(
            ctx.db,
            inputFor(ctx, payload),
          ),
        ),
      ),
    )
  },
  async review(ctx, payload) {
    const value = assertReviewAvailable(
      await commandOperation(() =>
        reviewStaffInvitationCommandInTransaction(
          ctx.db,
          inputFor(ctx, payload),
        ),
      ),
    )
    return { target: target(value), lines: staffInvitationReviewLines(value) }
  },
  prepareExecution: prepareStaffInvitation,
  async execute(ctx, payload, key) {
    const prepared = await prepareStaffInvitation(ctx, payload)
    return prepared.execute(key)
  },
}
