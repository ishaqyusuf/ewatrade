import superjson from "superjson"
import { bookingReviewDataSnapshot } from "./general-booking-review-transport-data"

export const BOOKING_REVIEW_WIRE_MAX_BYTES = 1024 * 1024
export const BOOKING_REVIEW_ENVELOPE_RESERVE_BYTES = 4096
/** ONE result only; actual route MUST reject multi-operation batches and bound
 * its real emitted body. Counts the larger one-result batch representation. */
export function bookingReviewEnvelopeBytes(value: unknown) {
  const data = bookingReviewDataSnapshot(value, BOOKING_REVIEW_WIRE_MAX_BYTES)
  return Buffer.byteLength(
    JSON.stringify([{ result: { data: superjson.serialize(data) } }]),
    "utf8",
  )
}
export function bookingReviewEnvelopeFits(value: unknown) {
  return (
    bookingReviewEnvelopeBytes(value) + BOOKING_REVIEW_ENVELOPE_RESERVE_BYTES <=
    BOOKING_REVIEW_WIRE_MAX_BYTES
  )
}
