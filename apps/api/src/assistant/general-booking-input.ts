import {
  type GeneralBookingAction,
  generalBookingActionSchema,
} from "@ewatrade/assistant/general/booking-action"
import type { StaffServiceCommerceBookingReviewInput } from "@ewatrade/db/service-booking-command-review"
import { z } from "zod"

const id = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const scopeSchema = z
  .object({ actorUserId: id, tenantId: id, storeId: id })
  .strict()

/** Pure construction after server identity allocation. This does not prove
 * current authority, availability, review, human approval or a canonical effect.
 * The caller retains the unchanged original action for signing/history; parsed
 * native Dates preserve its exact instant, including offset/millisecond forms.
 * A future HTTP endpoint still owes raw-byte/data-only admission before parsing.
 */
export function generalBookingNativeInput(
  payload: GeneralBookingAction,
  scope: { actorUserId: string; tenantId: string; storeId: string },
  clientOperationId: string,
): StaffServiceCommerceBookingReviewInput {
  const input = generalBookingActionSchema.parse(payload)
  const current = scopeSchema.parse(scope)
  // Only this explicit server allowlist is shared between branches. Never copy
  // a broader context, editable payload, or client-provided command identity.
  const common = {
    actorUserId: current.actorUserId,
    tenantId: current.tenantId,
    storeId: current.storeId,
    clientOperationId: id.parse(clientOperationId),
  }
  switch (input.action) {
    case "service_booking_hold":
      return {
        kind: "hold",
        input: {
          ...common,
          source: { kind: "service", id: input.source.id },
          offeringId: input.offeringId,
          resourceId: input.resourceId,
          quantity: input.quantity,
          expectedConfigurationRevision: input.expectedConfigurationRevision,
          slotStartAt: new Date(input.slotStartAt),
          slotEndAt: new Date(input.slotEndAt),
        },
      }
    case "service_booking_confirm":
      return {
        kind: "confirm",
        input: {
          ...common,
          source: { kind: "service", id: input.source.id },
          holdId: input.holdId,
          ...(input.quoteVersionId !== undefined
            ? { quoteVersionId: input.quoteVersionId }
            : {}),
          ...(input.commercialOrderId !== undefined
            ? { commercialOrderId: input.commercialOrderId }
            : {}),
          ...(input.serviceJobId !== undefined
            ? { serviceJobId: input.serviceJobId }
            : {}),
          // No clientBookingId: preserve the native clientOperationId default.
        },
      }
    case "service_booking_arrive":
    case "service_booking_start":
    case "service_booking_complete":
      return {
        kind: "revise",
        input: {
          ...common,
          bookingId: input.bookingId,
          expectedRevision: input.expectedRevision,
          operation:
            input.action === "service_booking_arrive"
              ? "arrive"
              : input.action === "service_booking_start"
                ? "start"
                : "complete",
        },
      }
    case "service_booking_cancel":
    case "service_booking_no_show":
      return {
        kind: "revise",
        input: {
          ...common,
          bookingId: input.bookingId,
          expectedRevision: input.expectedRevision,
          operation:
            input.action === "service_booking_cancel"
              ? "cancel"
              : "mark_no_show",
          reasonCode: input.reasonCode,
        },
      }
    case "service_booking_reschedule":
      return {
        kind: "revise",
        input: {
          ...common,
          bookingId: input.bookingId,
          expectedRevision: input.expectedRevision,
          operation: "reschedule",
          reasonCode: input.reasonCode,
          resourceId: input.resourceId,
          newSlotStartAt: new Date(input.newSlotStartAt),
          newSlotEndAt: new Date(input.newSlotEndAt),
        },
      }
  }
}
