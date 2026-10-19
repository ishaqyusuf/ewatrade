import { z } from "zod"

// Exact opaque saved identities; never trim or interpret a path as an identity.
const exactId = z
  .string()
  .min(1)
  .max(191)
  .refine(
    (value) =>
      value === value.trim() &&
      value !== "." &&
      value !== ".." &&
      [...value].every((character) => {
        const code = character.charCodeAt(0)
        return (
          code > 32 &&
          (code < 127 || code > 159) &&
          !"/\\?#%".includes(character)
        )
      }),
    "Use the exact saved booking identity.",
  )

/** Scope, clock, exclusions and current configuration belong to the server. */
export const assistantBookingAvailabilityInput = z
  .object({
    source: z.object({ kind: z.literal("service"), id: exactId }).strict(),
    offeringId: exactId,
    resourceId: exactId,
    from: z.date(),
    to: z.date(),
    quantity: z.number().int().min(1).max(10_000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict()
