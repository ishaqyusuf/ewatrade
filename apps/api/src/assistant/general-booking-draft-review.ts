import type { GeneralBookingAction } from "@ewatrade/assistant/general/booking-action"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import { reviewStaffServiceCommerceBookingCommandInTransaction } from "@ewatrade/db/service-booking-command-review"
import type { Prisma } from "@ewatrade/db/types"
import {
  type BookingDraftConversationScope,
  bookingDraftTargetId,
  refuseBookingDraft,
} from "./general-booking-draft-contract"
import { generalBookingNativeInput } from "./general-booking-input"

export async function reviewBookingDraft(
  tx: Prisma.TransactionClient,
  scope: BookingDraftConversationScope,
  payload: GeneralBookingAction,
  idempotencyKey: string,
) {
  const nativeInput = generalBookingNativeInput(
    payload,
    {
      actorUserId: scope.actorUserId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    },
    idempotencyKey,
  )
  const review = await reviewStaffServiceCommerceBookingCommandInTransaction(
    tx,
    nativeInput,
  )
  if (
    review.target.id !== bookingDraftTargetId(payload) ||
    !/^[a-f0-9]{64}$/.test(review.target.revision) ||
    review.review.authority.store.id !== scope.storeId ||
    review.review.authority.store.tenantId !== scope.tenantId ||
    nativeInput.input.actorUserId !== scope.actorUserId ||
    nativeInput.input.tenantId !== scope.tenantId ||
    nativeInput.input.storeId !== scope.storeId ||
    nativeInput.input.clientOperationId !== idempotencyKey
  )
    refuseBookingDraft("invalid_binding")
  return { nativeInput, review }
}
export function requireCurrentBookingDraftReview(
  row: AssistantActionProposal,
  review: Awaited<ReturnType<typeof reviewBookingDraft>>["review"],
) {
  if (
    row.targetRecordId !== review.target.id ||
    row.targetRevision !== review.target.revision ||
    row.roleSnapshot !== review.review.authority.role
  )
    refuseBookingDraft("stale_review")
}
