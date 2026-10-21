import { z } from "zod"
export { staffRemovalReviewInput } from "@ewatrade/assistant/general/staff-removal"

/** App clients remove someone who never joined; the server rechecks eligibility. */
export const retailOpsRemoveUnacceptedStaffSchema = z
  .object({
    membershipId: z.string().trim().min(1).max(160),
    expectedRevision: z.number().int().positive().safe().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
