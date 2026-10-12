import { z } from "zod"
const id = z.string().trim().min(1).max(160)
export const staffStatusAction = z
  .object({
    action: z.literal("staff_status"),
    membershipId: id,
    status: z.enum(["active", "suspended"]),
    expectedRevision: z.number().int().positive().safe(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
export type GeneralStaffStatusAction = z.infer<typeof staffStatusAction>
export const staffStatusReviewInput = staffStatusAction
  .omit({ action: true, expectedRevision: true })
  .strict()
export const staffStatusReadInput = z.object({ eventId: id }).strict()
export const staffStatusTargetSchema = z
  .object({ kind: z.literal("staff_status"), eventId: id })
  .strict()
export const staffStatusDraftInstructions =
  "When staff_status is available, resolve the exact saved membership by directory/name/email; clarify same-name results, never ask the merchant for IDs or JSON. Distinguish whole-business suspension from removing one Store assignment. Require a reason and use reviewStaffStatus to get the original current access revision, whole-business impact and current grants; never invent a revision or reuse one from another member. Reactivation requires completed onboarding, current allowed grants/default/catalog and current plan; it never restores removed grants or activates an unaccepted invitation. App review and confirmation are required. After confirmation read/open the exact original status event separately from the current membership. Existing orders, jobs and history retain ownership; suspension releases assigned conversations to the Store queue. Do not claim a saved suspension cancelled historical work or erased an invitation email already sent."
