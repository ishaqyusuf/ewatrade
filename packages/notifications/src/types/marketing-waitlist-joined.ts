import { z } from "zod"

import { defineNotificationType } from "../notification-types"

export const marketingWaitlistJoinedPayloadSchema = z.object({
  companyName: z.string().trim().min(1).nullable().optional(),
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  id: z.string().trim().min(1),
  message: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  roleTitle: z.string().trim().min(1).nullable().optional()
})

export type MarketingWaitlistJoinedPayload = z.infer<
  typeof marketingWaitlistJoinedPayloadSchema
>

export const marketingWaitlistJoined = defineNotificationType({
  defaultChannels: ["email", "in_app"],
  defaultRecipients: ["email"],
  description: "A visitor joined the ewatrade waitlist from the marketing site.",
  schema: marketingWaitlistJoinedPayloadSchema,
  title: "New waitlist signup",
  variant: "info"
})
