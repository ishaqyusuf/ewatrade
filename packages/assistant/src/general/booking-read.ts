import { z } from "zod"

const id = z.string().trim().min(1).max(160)

export const generalBookingReadInput = z
  .object({ bookingId: id, sourceId: id, offeringId: id })
  .strict()

/** Original saved booking, not a public token or permission to modify it. */
export const serviceBookingTargetSchema = generalBookingReadInput
  .extend({ kind: z.literal("service_booking") })
  .strict()

export type ServiceBookingTarget = z.infer<typeof serviceBookingTargetSchema>
