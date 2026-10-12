import { z } from "zod"

const id = z.string().trim().min(1).max(160)
export const staffAccessAction = z
  .object({
    action: z.literal("staff_access"),
    membershipId: id,
    expectedRevision: z.number().int().positive().safe(),
    confirmLegacyCutover: z.boolean(),
    assignments: z
      .array(
        z
          .object({
            storeId: id,
            role: z.enum(["CASHIER", "OPERATOR", "MANAGER"]),
          })
          .strict(),
      )
      .max(100),
    defaultStoreId: id.nullable(),
    catalogEditor: z.boolean(),
  })
  .strict()
export type GeneralStaffAccessAction = z.infer<typeof staffAccessAction>
export const staffAccessReviewInput = staffAccessAction
  .omit({ action: true, expectedRevision: true })
  .strict()
export const staffAccessReadInput = z.object({ eventId: id }).strict()
export const staffAccessTargetSchema = z
  .object({ kind: z.literal("staff_access"), eventId: id })
  .strict()
export const staffAccessDraftInstructions =
  "When staff_access is available, resolve the exact saved membership and same-business Stores by names using the directory; clarify ambiguous results. Review per-Store Cashier/Operator/Manager rows, starting Store and separate catalog editing grant. Review supplies the current expectedRevision. Never infer a revision, combine Store roles, grant Owner/Admin, suspend/reactivate membership, or silently reassign service work or historical sales. Legacy cutover needs explicit acknowledgment of replacing business-wide access; an empty assignment set removes Store access without suspending membership. Signed app review/Edit/re-review/Confirm is required. Original outcome comes from the exact StaffAccessAuditEvent; reason, business-role mutation and handover are not recorded by this command, and current labels are not historical names."
