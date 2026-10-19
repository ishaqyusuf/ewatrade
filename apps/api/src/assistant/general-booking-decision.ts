import { TRPCError } from "@trpc/server"
import {
  GeneralBookingConfirmationError,
  type GeneralBookingConfirmationOutcome,
  confirmGeneralBookingInTransaction,
  inspectGeneralBookingConfirmationInTransaction,
  prepareGeneralBookingConfirmation,
} from "./general-booking-confirmation"
import {
  type BookingConfirmationRequest,
  bookingConfirmationInputs,
} from "./general-booking-confirmation-contract"
import { GeneralBookingDraftStoreError } from "./general-booking-draft-store"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"

type DecisionTransaction = Parameters<
  typeof inspectGeneralBookingConfirmationInTransaction
>[0]
type DecisionScope = Parameters<
  typeof inspectGeneralBookingConfirmationInTransaction
>[1]

async function freshBookingDecision<T>(
  ctx: GeneralContext,
  request: BookingConfirmationRequest,
  operation: (
    tx: DecisionTransaction,
    scope: DecisionScope,
    key: string,
  ) => Promise<T>,
) {
  return inFreshGeneralTransaction(ctx, (fresh) => {
    const scope = requireGeneralScope(fresh)
    if (
      fresh.assistantConversationId !== undefined &&
      fresh.assistantConversationId !== request.conversationId
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This booking draft is unavailable.",
      })
    return operation(
      fresh.db,
      {
        actorUserId: scope.userId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
      },
      process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
    )
  })
}

/** UNREGISTERED server orchestration, never a model tool or public DTO. The
 * authenticated caller still owes action/client/rollout admission and bounded
 * raw HTTP bytes. The original scalar request is copied before the first await.
 * Each owning Serializable transaction repeats actual GENERAL Session/current
 * Store/account/privacy/legal and exact linked-chat authority. Inspection ends
 * before actual local token/cipher allocation; the second fresh transaction
 * atomically claims, executes and saves the exact native receipt. Terminal or
 * uncertain proof recovery/cancellation resolves in the FIRST transaction with
 * no preparation, new command or dispatch. Any error rolls back its owning TX.
 *
 * Return is SERVER ONLY: notification identifiers are an after-COMMIT sidecar.
 * Never persist/expose them in a model/app/history receipt. The caller may enqueue
 * only after this function succeeds; existing durable pending-intent sweep owns
 * lost postcommit enqueue recovery. This function calls no provider/queue/job.
 */
export async function decideGeneralBooking(
  ctx: GeneralContext,
  raw: unknown,
): Promise<GeneralBookingConfirmationOutcome> {
  try {
    const initial = requireGeneralScope(ctx)
    const { request } = bookingConfirmationInputs(
      {
        actorUserId: initial.userId,
        tenantId: initial.tenantId,
        storeId: initial.storeId,
      },
      raw,
    )
    const inspection = await freshBookingDecision(
      ctx,
      request,
      (tx, scope, key) =>
        inspectGeneralBookingConfirmationInTransaction(tx, scope, request, key),
    )
    if (inspection.kind === "resolved")
      return { result: inspection.result, notificationDispatches: [] }
    const prepared = prepareGeneralBookingConfirmation(inspection.plan)
    return await freshBookingDecision(ctx, request, (tx, scope, key) =>
      confirmGeneralBookingInTransaction(tx, scope, request, key, prepared),
    )
  } catch (error) {
    if (error instanceof GeneralBookingConfirmationError)
      throw new TRPCError({
        code: error.reason === "invalid_request" ? "BAD_REQUEST" : "CONFLICT",
        message:
          "Check this booking draft's original saved result before retrying.",
      })
    if (error instanceof GeneralBookingDraftStoreError)
      throw new TRPCError({
        code: error.reason === "unavailable" ? "NOT_FOUND" : "CONFLICT",
        message: "This booking draft is unavailable. Review it again.",
      })
    throw error
  }
}
