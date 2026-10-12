import { z } from "zod"
import { staffHistoryTargetSchema } from "./staff-history-target"
import { staffDirectoryTargetSchema } from "./staff-directory-target"

/** Navigation identity only; the native query derives Tenant/actor and checks access. */
export const staffMemberTargetSchema = z
  .object({
    kind: z.literal("staff_member"),
    membershipId: z.string().trim().min(1).max(160),
  })
  .strict()

export const staffInvitationTargetSchema = z
  .object({
    kind: z.literal("staff_invitation"),
    commandId: z.string().trim().min(1).max(160),
  })
  .strict()

export const generalAnswerTargetSchema = z.discriminatedUnion("kind", [
  staffInvitationTargetSchema,
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
  staffDirectoryTargetSchema,
])
