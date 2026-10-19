import { protectCommunicationsRecipient } from "@ewatrade/communications"
import type { StaffServiceCommerceBookingReviewInput } from "@ewatrade/db/service-booking-command-review"
import {
  type PreparedServiceCommerceBookingConfirmation,
  type PreparedServiceCommerceBookingHold,
  type PreparedServiceCommerceBookingRevision,
  type ServiceCommerceBookingConfirmationInspection,
  confirmPreparedServiceCommerceBookingInTransaction,
  createPreparedServiceCommerceBookingHoldInTransaction,
  inspectServiceCommerceBookingConfirmationInTransaction,
  prepareServiceCommerceBookingConfirmation,
  prepareServiceCommerceBookingHold,
  prepareServiceCommerceBookingRevision,
  revisePreparedServiceCommerceBookingInTransaction,
} from "@ewatrade/db/service-booking-commands"
import type { Prisma } from "@ewatrade/db/types"
import { issueServiceCommerceBookingCapabilityToken } from "../service-commerce/booking-capability"
import {
  type BookingConfirmationRequest,
  type GeneralBookingConfirmationOutcome,
  type GeneralBookingConfirmationResult,
  assertBookingConfirmationApproval,
  assertBookingConfirmationReadback,
  bookingConfirmationCAS,
  bookingConfirmationFingerprint,
  bookingConfirmationInputs,
  bookingConfirmationReceipt,
  bookingConfirmationScope,
  refuseBookingConfirmation as refuse,
  sameBookingConfirmationReceipt,
} from "./general-booking-confirmation-contract"
import {
  cancelBookingDecision,
  loadBookingDecision,
  readBookingDecisionEffect,
  recoverBookingDecision,
} from "./general-booking-confirmation-recovery"
import {
  type GeneralBookingDraftScope,
  readGeneralBookingDraftInTransaction,
} from "./general-booking-draft-store"

export {
  GeneralBookingConfirmationError,
  type GeneralBookingConfirmationOutcome,
  type GeneralBookingConfirmationResult,
} from "./general-booking-confirmation-contract"

declare const planBrand: unique symbol
declare const preparedBrand: unique symbol
export type GeneralBookingConfirmationPlan = { readonly [planBrand]: true }
export type PreparedGeneralBookingConfirmation = {
  readonly [preparedBrand]: true
}
type State = {
  scope: GeneralBookingDraftScope
  request: Pick<
    BookingConfirmationRequest,
    "conversationId" | "draftRef" | "revision"
  >
  rowBinding: string
  native: StaffServiceCommerceBookingReviewInput
  target: { id: string; revision: string }
  contactInspection: ServiceCommerceBookingConfirmationInspection | null
}
type NativePrepared =
  | { kind: "hold"; handle: PreparedServiceCommerceBookingHold }
  | { kind: "confirm"; handle: PreparedServiceCommerceBookingConfirmation }
  | { kind: "revise"; handle: PreparedServiceCommerceBookingRevision }
const plans = new WeakMap<GeneralBookingConfirmationPlan, State>()
const prepared = new WeakMap<
  PreparedGeneralBookingConfirmation,
  { state: State; native: NativePrepared }
>()
const preparations = new WeakMap<
  GeneralBookingConfirmationPlan,
  PreparedGeneralBookingConfirmation
>()
function sameScope(
  state: State,
  scope: GeneralBookingDraftScope,
  request: BookingConfirmationRequest,
) {
  return (
    state.scope.actorUserId === scope.actorUserId &&
    state.scope.tenantId === scope.tenantId &&
    state.scope.storeId === scope.storeId &&
    state.request.conversationId === request.conversationId &&
    state.request.draftRef === request.draftRef &&
    state.request.revision === request.revision
  )
}
/** UNEXPOSED. Caller owns fresh GENERAL Session/account/privacy/legal, client,
 * action/domain and rollout guards plus one consistent authorized inspection TX.
 * Native proof is checked before new-execution gates, expiry or token allocation.
 */
export async function inspectGeneralBookingConfirmationInTransaction(
  tx: Prisma.TransactionClient,
  serverScope: GeneralBookingDraftScope,
  raw: unknown,
  key: string,
): Promise<
  | { kind: "resolved"; result: GeneralBookingConfirmationResult }
  | { kind: "pending"; plan: GeneralBookingConfirmationPlan }
> {
  const { scope, request } = bookingConfirmationInputs(serverScope, raw)
  const saved = await loadBookingDecision(tx, scope, request)
  const recovered = await recoverBookingDecision(tx, scope, request, saved)
  if (recovered) return { kind: "resolved", result: recovered }
  if (request.decision === "cancel")
    return {
      kind: "resolved",
      result: await cancelBookingDecision(tx, scope, request, saved),
    }
  assertBookingConfirmationApproval(saved.row, request, key)
  const fresh = await readGeneralBookingDraftInTransaction(
    tx,
    {
      ...scope,
      conversationId: request.conversationId,
      draftRef: request.draftRef,
    },
    key,
  )
  if (
    bookingConfirmationFingerprint(fresh.row) !==
    bookingConfirmationFingerprint(saved.row)
  )
    refuse("stale")
  const native = structuredClone(fresh.nativeInput)
  const contactInspection =
    native.kind === "confirm"
      ? await inspectServiceCommerceBookingConfirmationInTransaction(
          tx,
          native.input,
        )
      : null
  assertBookingConfirmationApproval(fresh.row, request, key)
  const state: State = {
    scope: structuredClone(scope),
    request: {
      conversationId: request.conversationId,
      draftRef: request.draftRef,
      revision: request.revision,
    },
    rowBinding: bookingConfirmationFingerprint(fresh.row),
    native,
    target: structuredClone(fresh.review.target),
    contactInspection,
  }
  const plan = Object.freeze({}) as GeneralBookingConfirmationPlan
  plans.set(plan, state)
  return { kind: "pending", plan }
}
/** MUST run after inspection TX closes. Only actual local token/encryption
 * allocation, no TX/delegate, provider, enqueue or callback is retained.
 */
export function prepareGeneralBookingConfirmation(
  plan: GeneralBookingConfirmationPlan,
): PreparedGeneralBookingConfirmation {
  const state = plans.get(plan)
  if (!state) refuse("preparation_required")
  const existing = preparations.get(plan)
  if (existing) return existing
  const input = structuredClone(state.native)
  let native: NativePrepared
  if (input.kind === "hold")
    native = {
      kind: "hold",
      handle: prepareServiceCommerceBookingHold(
        input.input,
        issueServiceCommerceBookingCapabilityToken,
      ),
    }
  else if (input.kind === "revise")
    native = {
      kind: "revise",
      handle: prepareServiceCommerceBookingRevision(
        input.input,
        issueServiceCommerceBookingCapabilityToken,
      ),
    }
  else {
    if (!state.contactInspection) refuse("preparation_required")
    native = {
      kind: "confirm",
      handle: prepareServiceCommerceBookingConfirmation(
        state.contactInspection,
        {
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          protectRecipient: protectCommunicationsRecipient,
        },
      ),
    }
  }
  const handle = Object.freeze({}) as PreparedGeneralBookingConfirmation
  prepared.set(handle, { state, native })
  preparations.set(plan, handle)
  return handle
}
/** One caller-owned fresh authorized Serializable TX: claim + native effects +
 * exact receipt are atomic. Any throw MUST roll everything back. Retain the same
 * opaque handle across rollback retry. Return dispatch IDs privately and enqueue
 * only after the owning TX commits; recovery/cancellation never enqueue anything.
 */
export async function confirmGeneralBookingInTransaction(
  tx: Prisma.TransactionClient,
  serverScope: GeneralBookingDraftScope,
  raw: unknown,
  key: string,
  handle?: PreparedGeneralBookingConfirmation,
): Promise<GeneralBookingConfirmationOutcome> {
  const { scope, request } = bookingConfirmationInputs(serverScope, raw)
  const allocation = handle === undefined ? undefined : prepared.get(handle)
  if (
    handle !== undefined &&
    (!allocation || !sameScope(allocation.state, scope, request))
  )
    refuse("preparation_required")
  const saved = await loadBookingDecision(tx, scope, request)
  const recovered = await recoverBookingDecision(tx, scope, request, saved)
  if (recovered) return { result: recovered, notificationDispatches: [] }
  if (request.decision === "cancel")
    return {
      result: await cancelBookingDecision(tx, scope, request, saved),
      notificationDispatches: [],
    }
  if (!allocation) refuse("preparation_required")
  assertBookingConfirmationApproval(saved.row, request, key)
  if (bookingConfirmationFingerprint(saved.row) !== allocation.state.rowBinding)
    refuse("stale")
  const fresh = await readGeneralBookingDraftInTransaction(
    tx,
    {
      ...scope,
      conversationId: request.conversationId,
      draftRef: request.draftRef,
    },
    key,
  )
  if (
    bookingConfirmationFingerprint(fresh.row) !== allocation.state.rowBinding ||
    fresh.review.target.id !== allocation.state.target.id ||
    fresh.review.target.revision !== allocation.state.target.revision
  )
    refuse("stale")
  assertBookingConfirmationApproval(fresh.row, request, key)
  const changed = await tx.assistantActionProposal.updateMany({
    where: {
      ...bookingConfirmationCAS(
        bookingConfirmationScope(scope, request),
        fresh.row,
      ),
      status: "PENDING",
      expiresAt: { equals: fresh.row.expiresAt, gt: new Date(Date.now()) },
    },
    data: { status: "EXECUTING" },
  })
  if (changed.count !== 1) refuse("stale")
  const executing = await loadBookingDecision(tx, scope, request)
  if (
    executing.row.status !== "EXECUTING" ||
    bookingConfirmationFingerprint({
      ...executing.row,
      status: "PENDING",
      updatedAt: fresh.row.updatedAt,
    }) !== bookingConfirmationFingerprint(fresh.row)
  )
    refuse("stale")
  const native = allocation.native
  const result =
    native.kind === "hold"
      ? await createPreparedServiceCommerceBookingHoldInTransaction(
          tx,
          native.handle,
          scope,
        )
      : native.kind === "confirm"
        ? await confirmPreparedServiceCommerceBookingInTransaction(
            tx,
            native.handle,
            scope,
          )
        : await revisePreparedServiceCommerceBookingInTransaction(
            tx,
            native.handle,
            scope,
          )
  const receipt = bookingConfirmationReceipt(result.receipt)
  const proof = await readBookingDecisionEffect(tx, executing)
  if (!proof || !sameBookingConfirmationReceipt(proof, receipt))
    refuse("saved_result_unavailable")
  const decidedAt = new Date(Date.now())
  const completed = await tx.assistantActionProposal.updateMany({
    where: bookingConfirmationCAS(
      bookingConfirmationScope(scope, request),
      executing.row,
    ),
    data: {
      status: "COMPLETED",
      executedResult: receipt,
      decidedAt,
      errorCode: null,
    },
  })
  if (completed.count !== 1) refuse("stale")
  const current = await loadBookingDecision(tx, scope, request)
  assertBookingConfirmationReadback(executing.row, current.row, {
    status: "COMPLETED",
    executedResult: receipt,
    decidedAt,
    errorCode: null,
  })
  const checked = await recoverBookingDecision(tx, scope, request, current)
  if (
    !checked ||
    checked.kind !== "completed" ||
    !sameBookingConfirmationReceipt(checked.receipt, receipt)
  )
    refuse("saved_result_unavailable")
  return {
    result: { ...checked, recovered: false },
    notificationDispatches:
      "notificationDispatches" in result ? result.notificationDispatches : [],
  }
}
