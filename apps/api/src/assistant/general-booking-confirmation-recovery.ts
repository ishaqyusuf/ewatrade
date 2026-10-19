import {
  readServiceCommerceBookingConfirmationEffectInTransaction,
  readServiceCommerceBookingHoldEffectInTransaction,
  readServiceCommerceBookingRevisionEffectInTransaction,
} from "@ewatrade/db/service-booking-command-effects"
import type { Prisma } from "@ewatrade/db/types"
import {
  type BookingConfirmationRequest,
  type GeneralBookingConfirmationResult,
  assertBookingConfirmationReadback,
  bookingConfirmationCAS,
  bookingConfirmationReceipt,
  bookingConfirmationScope,
  refuseBookingConfirmation as refuse,
  sameBookingConfirmationReceipt,
} from "./general-booking-confirmation-contract"
import type { GeneralBookingDraftScope } from "./general-booking-draft-contract"
import { inspectGeneralBookingDraftRowInTransaction } from "./general-booking-draft-store"

export type BookingDecisionSaved = Awaited<
  ReturnType<typeof loadBookingDecision>
>
export async function loadBookingDecision(
  tx: Prisma.TransactionClient,
  scope: GeneralBookingDraftScope,
  request: BookingConfirmationRequest,
) {
  const found = await inspectGeneralBookingDraftRowInTransaction(tx, {
    ...scope,
    conversationId: request.conversationId,
    draftRef: request.draftRef,
  })
  if (found.row.revision !== request.revision) refuse("stale")
  // No live delegate/returned mutable row is retained across later awaits.
  return structuredClone(found)
}
async function originalWithoutEffect(
  tx: Prisma.TransactionClient,
  saved: BookingDecisionSaved,
) {
  const { input } = saved.nativeInput
  let sourceId: string
  if (saved.nativeInput.kind === "revise") {
    const booking = await tx.serviceBooking.findFirst({
      where: {
        id: saved.nativeInput.input.bookingId,
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
      select: {
        id: true,
        sourceId: true,
        sourceType: true,
        tenantId: true,
        storeId: true,
      },
    })
    if (
      !booking ||
      booking.id !== saved.nativeInput.input.bookingId ||
      booking.sourceType !== "SERVICE_REQUEST" ||
      booking.tenantId !== input.tenantId ||
      booking.storeId !== input.storeId
    )
      refuse("unavailable")
    sourceId = booking.sourceId
  } else {
    sourceId = saved.nativeInput.input.source.id
    if (saved.nativeInput.kind === "confirm") {
      const hold = await tx.serviceBookingHold.findFirst({
        where: {
          id: saved.nativeInput.input.holdId,
          tenantId: input.tenantId,
          storeId: input.storeId,
        },
        select: {
          id: true,
          sourceId: true,
          sourceType: true,
          tenantId: true,
          storeId: true,
        },
      })
      if (
        !hold ||
        hold.id !== saved.nativeInput.input.holdId ||
        hold.sourceId !== sourceId ||
        hold.sourceType !== "SERVICE_REQUEST" ||
        hold.tenantId !== input.tenantId ||
        hold.storeId !== input.storeId
      )
        refuse("unavailable")
    }
  }
  const source = await tx.serviceRequest.findFirst({
    where: { id: sourceId, tenantId: input.tenantId, storeId: input.storeId },
    select: { id: true, tenantId: true, storeId: true },
  })
  if (
    !source ||
    source.id !== sourceId ||
    source.tenantId !== input.tenantId ||
    source.storeId !== input.storeId
  )
    refuse("unavailable")
}
/** Each actual reader establishes current native authority even if the exact effect is absent. */
export async function readBookingDecisionEffect(
  tx: Prisma.TransactionClient,
  saved: BookingDecisionSaved,
) {
  const native = saved.nativeInput
  const effect =
    native.kind === "hold"
      ? await readServiceCommerceBookingHoldEffectInTransaction(
          tx,
          native.input,
        )
      : native.kind === "confirm"
        ? await readServiceCommerceBookingConfirmationEffectInTransaction(
            tx,
            native.input,
          )
        : await readServiceCommerceBookingRevisionEffectInTransaction(
            tx,
            native.input,
          )
  if (!effect) {
    await originalWithoutEffect(tx, saved)
    return null
  }
  return bookingConfirmationReceipt(effect)
}
/** Exact proof first. Never call a command, token/crypto, new readiness or notification scheduler. */
export async function recoverBookingDecision(
  tx: Prisma.TransactionClient,
  scope: GeneralBookingDraftScope,
  request: BookingConfirmationRequest,
  saved: BookingDecisionSaved,
): Promise<GeneralBookingConfirmationResult | null> {
  const receipt = await readBookingDecisionEffect(tx, saved)
  const { row } = saved
  if (row.status === "CANCELLED") {
    if (receipt) refuse("effect_conflict")
    return { kind: "cancelled", draftRef: row.id, revision: row.revision }
  }
  if (row.status === "COMPLETED") {
    if (
      !receipt ||
      !sameBookingConfirmationReceipt(row.executedResult, receipt)
    )
      refuse("saved_result_unavailable")
    return {
      kind: "completed",
      draftRef: row.id,
      revision: row.revision,
      receipt,
      recovered: true,
    }
  }
  if (receipt) {
    if (!["PENDING", "EXECUTING", "FAILED", "EXPIRED"].includes(row.status))
      refuse("effect_conflict")
    if (
      row.executedResult !== null &&
      !sameBookingConfirmationReceipt(row.executedResult, receipt)
    )
      refuse("saved_result_unavailable")
    const decidedAt = new Date(Date.now())
    const changed = await tx.assistantActionProposal.updateMany({
      where: bookingConfirmationCAS(
        bookingConfirmationScope(scope, request),
        row,
      ),
      data: {
        status: "COMPLETED",
        executedResult: receipt,
        errorCode: null,
        decidedAt,
      },
    })
    if (changed.count !== 1) refuse("stale")
    const current = await loadBookingDecision(tx, scope, request)
    assertBookingConfirmationReadback(row, current.row, {
      status: "COMPLETED",
      executedResult: receipt,
      errorCode: null,
      decidedAt,
    })
    if (
      current.row.status !== "COMPLETED" ||
      !sameBookingConfirmationReceipt(current.row.executedResult, receipt)
    )
      refuse("saved_result_unavailable")
    const checked = await readBookingDecisionEffect(tx, current)
    if (!checked || !sameBookingConfirmationReceipt(checked, receipt))
      refuse("saved_result_unavailable")
    return {
      kind: "completed",
      draftRef: row.id,
      revision: row.revision,
      receipt: checked,
      recovered: true,
    }
  }
  if (row.status !== "PENDING") refuse("unknown_effect")
  return null
}
export async function cancelBookingDecision(
  tx: Prisma.TransactionClient,
  scope: GeneralBookingDraftScope,
  request: BookingConfirmationRequest,
  saved: BookingDecisionSaved,
): Promise<GeneralBookingConfirmationResult> {
  if (
    saved.row.status !== "PENDING" ||
    saved.row.executedResult !== null ||
    saved.row.errorCode !== null ||
    saved.row.decidedAt !== null
  )
    refuse("unavailable")
  const decidedAt = new Date(Date.now())
  const changed = await tx.assistantActionProposal.updateMany({
    where: bookingConfirmationCAS(
      bookingConfirmationScope(scope, request),
      saved.row,
    ),
    data: { status: "CANCELLED", decidedAt },
  })
  if (changed.count !== 1) refuse("stale")
  const current = await loadBookingDecision(tx, scope, request)
  assertBookingConfirmationReadback(saved.row, current.row, {
    status: "CANCELLED",
    decidedAt,
  })
  if (current.row.status !== "CANCELLED") refuse("saved_result_unavailable")
  const result = await recoverBookingDecision(tx, scope, request, current)
  if (!result || result.kind !== "cancelled") refuse("saved_result_unavailable")
  return result
}
