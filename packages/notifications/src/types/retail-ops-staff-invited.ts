import { z } from "zod"

import { defineNotificationType } from "../notification-types"

export const retailOpsStaffInvitedPayloadSchema = z.object({
  appUrl: z.string().url(),
  businessName: z.string().trim().min(1),
  inviteUrl: z.string().url().optional(),
  invitedByName: z.string().trim().min(1),
  inviteeEmail: z.string().email(),
  inviteeName: z.string().trim().min(1).nullable().optional(),
  membershipId: z.string().trim().min(1),
  role: z.string().trim().min(1),
})

export type RetailOpsStaffInvitedPayload = z.infer<
  typeof retailOpsStaffInvitedPayloadSchema
>

export const retailOpsStaffInvited = defineNotificationType({
  defaultChannels: ["email", "in_app"],
  defaultRecipients: ["email"],
  description: "A Retail Ops staff member was invited to join a business.",
  schema: retailOpsStaffInvitedPayloadSchema,
  title: "Staff invited",
  variant: "info",
})
