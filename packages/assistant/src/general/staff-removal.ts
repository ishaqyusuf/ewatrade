import { z } from "zod"
const id = z.string().trim().min(1).max(160)
/** Remove someone who never joined (pending or suspended unaccepted invite). */
export const staffRemovalAction = z
  .object({
    action: z.literal("staff_removal"),
    membershipId: id,
    expectedRevision: z.number().int().positive().safe(),
    reason: z
      .string()
      .trim()
      .min(1, "Enter a reason.")
      .max(500, "Keep the reason within 500 characters."),
  })
  .strict()
export type GeneralStaffRemovalAction = z.infer<typeof staffRemovalAction>
export const staffRemovalReviewInput = staffRemovalAction
  .omit({ action: true, expectedRevision: true })
  .strict()
export const staffRemovalDraftInstructions =
  "When staff_removal is available, use it only for someone who never joined: a pending, expired or suspended invite that was never accepted. Resolve the exact saved membership by directory/name/email and clarify same-name results; never ask the merchant for IDs or JSON. Staff who already joined are suspended (staff_status), not removed. Require a reason and use reviewStaffRemoval to get the current access revision and what removal does; never invent a revision. Removing revokes their invite links, cancels unsent invite emails, frees the staff seat and takes them off the staff list; they can be invited again. App review and confirmation are required. After confirmation read/open the original saved event separately from the current membership."
