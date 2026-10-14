import { z } from "zod"
import { serviceBookingTargetSchema } from "./booking-read"
import { businessReportTargetSchema } from "./business-report-target"
import {
  cashCountTargetSchema,
  dayCloseTargetSchema,
} from "./cash-count-target"
import { quoteApprovalTargetSchema } from "./quote-reads"
import { serviceWorkOriginalTargetSchema } from "./service-work-original"
import { staffAccessTargetSchema } from "./staff-access"
import { staffActivityTargetSchema } from "./staff-activity-target"
import { staffDirectoryTargetSchema } from "./staff-directory-target"
import { staffHistoryTargetSchema } from "./staff-history-target"
import { staffStatusTargetSchema } from "./staff-status"

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
  quoteApprovalTargetSchema,
  serviceBookingTargetSchema,
  ...serviceWorkOriginalTargetSchema.options,
  businessReportTargetSchema,
  cashCountTargetSchema,
  dayCloseTargetSchema,
  staffInvitationTargetSchema,
  staffStatusTargetSchema,
  staffAccessTargetSchema,
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
  staffDirectoryTargetSchema,
  staffActivityTargetSchema,
])
