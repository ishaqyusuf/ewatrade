import { z } from "zod"
import { assertCommerceQuoteReviewBudget } from "../commerce-quote-review-budget"
import {
  confirmationSchema,
  holdSchema,
  revisionSchema,
} from "./booking-command-schemas"
import { authority } from "./booking-review-facts"
import { reviewBookingCommandDetails } from "./booking-review-projection"
import { digest, stable } from "./booking-review-shared"
import { type BookingTransaction, ServiceCommerceBookingError } from "./shared"

const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hold"), input: holdSchema }).strict(),
  z.object({ kind: z.literal("confirm"), input: confirmationSchema }).strict(),
  z.object({ kind: z.literal("revise"), input: revisionSchema }).strict(),
])
export type StaffServiceCommerceBookingReviewInput = z.infer<typeof inputSchema>
/** SERVER-ONLY pure current review. Caller owns current GENERAL authority and a
 * consistent TX; no callbacks, token, lock, audit, write, TX or provider execution.
 * Observation clock excluded from digest; business effective/expiry dates remain.
 */
export async function reviewStaffServiceCommerceBookingCommandInTransaction(
  tx: BookingTransaction,
  raw: StaffServiceCommerceBookingReviewInput,
) {
  assertCommerceQuoteReviewBudget(raw)
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success)
    throw new ServiceCommerceBookingError(
      "BOOKING_INVALID_INPUT",
      "Keep the exact supported booking command.",
    )
  const command = structuredClone(parsed.data)
  const input = command.input
  const now = new Date(Date.now())
  const currentAuthority = await authority(tx, input)
  const result = await reviewBookingCommandDetails(tx, command, now)
  const review = {
    operation: command.kind,
    commandHash: result.commandHash,
    authority: currentAuthority,
    details: result.details,
  }
  // Explicit complete-JSON resource refusal, never partial effect or clipped lines.
  assertCommerceQuoteReviewBudget({ command, review })
  // Omit ONLY the generated hold-preview expiration observation at its named
  // location; saved hold expiry and every other effective/expiry date remain.
  const detailsForDigest =
    "observedExpiresAt" in review.details.effects
      ? {
          ...review.details,
          effects: Object.fromEntries(
            Object.entries(review.details.effects).filter(
              ([key]) => key !== "observedExpiresAt",
            ),
          ),
        }
      : review.details
  const binding = stable({
    command,
    review: { ...review, details: detailsForDigest },
  })
  const target = { id: result.targetId, revision: digest(binding) }
  return { target, review, asOf: now.toISOString() }
}

export type StaffServiceCommerceBookingCommandReview = Awaited<
  ReturnType<typeof reviewStaffServiceCommerceBookingCommandInTransaction>
>
