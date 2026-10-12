import { z } from "zod"

/** Navigation DTO only; the protected native query revalidates filters and authority. */
export const staffHistoryTargetSchema = z
  .object({
    kind: z.literal("staff_history"),
    filters: z
      .object({
        membershipId: z.string().trim().min(1).max(160).optional(),
        actorMembershipId: z.string().trim().min(1).max(160).optional(),
        storeId: z.string().trim().min(1).max(160).optional(),
        stream: z.enum(["LIFECYCLE", "STORE_ACCESS"]).optional(),
        eventType: z
          .enum([
            "INVITED",
            "INVITE_REFRESHED",
            "INVITE_REVOKED",
            "ONBOARDING_COMPLETED",
            "SUSPENDED",
            "REACTIVATED",
            "REMOVED",
            "ROLE_CHANGED",
            "STORE_ACCESS_CONFIRMED",
            "STORE_ACCESS_CHANGED",
            "OTHER_STORE_ACCESS_CHANGE",
          ])
          .optional(),
        from: z.iso.datetime({ offset: true }).optional(),
        to: z.iso.datetime({ offset: true }).optional(),
        cursor: z.string().min(1).max(2048).optional(),
      })
      .strict(),
  })
  .strict()
