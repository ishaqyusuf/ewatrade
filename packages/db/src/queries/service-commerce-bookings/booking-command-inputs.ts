import { serviceCommerceBookingHoldCommandSchema } from "@ewatrade/service-commerce"
import type {
  BookingConfirmationData,
  BookingHoldData,
  BookingRevisionData,
} from "./booking-command-types"
import { bookingPayloadHash } from "./shared"

/** Native normalization/hash branches, shared by legacy and prepared callers. */
export function bookingHoldCommandHash(input: BookingHoldData) {
  return bookingPayloadHash(
    serviceCommerceBookingHoldCommandSchema.parse({
      clientOperationId: input.clientOperationId,
      expectedConfigurationRevision: input.expectedConfigurationRevision,
      operation: "hold_slot",
      quantity: input.quantity,
      resourceId: input.resourceId,
      slotEndAt: input.slotEndAt,
      slotStartAt: input.slotStartAt,
      source: input.source,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
  )
}
export function bookingConfirmationCommandHash(input: BookingConfirmationData) {
  return bookingPayloadHash({
    clientBookingId: input.clientBookingId ?? input.clientOperationId,
    commercialOrderId: input.commercialOrderId ?? null,
    holdId: input.holdId,
    quoteVersionId: input.quoteVersionId ?? null,
    serviceJobId: input.serviceJobId ?? null,
    source: input.source,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
}
export function bookingRevisionCommandHash(input: BookingRevisionData) {
  return bookingPayloadHash({
    bookingId: input.bookingId,
    expectedRevision: input.expectedRevision,
    newSlotEndAt: input.newSlotEndAt ?? null,
    newSlotStartAt: input.newSlotStartAt ?? null,
    operation: input.operation,
    reasonCode: input.reasonCode ?? null,
    resourceId: input.resourceId ?? null,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
}
