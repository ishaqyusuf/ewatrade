import { z } from "zod"

import { defineNotificationType } from "../notification-types"

export const marketingEarlyAccessRequestedPayloadSchema = z.object({
  companyName: z.string().trim().min(1).nullable().optional(),
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  id: z.string().trim().min(1),
  message: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  roleTitle: z.string().trim().min(1).nullable().optional()
})

export type MarketingEarlyAccessRequestedPayload = z.infer<
  typeof marketingEarlyAccessRequestedPayloadSchema
>

export const marketingEarlyAccessRequested = defineNotificationType({
  defaultChannels: ["email", "in_app"],
  defaultRecipients: ["email"],
  description: "A merchant requested early access from the ewatrade marketing site.",
  schema: marketingEarlyAccessRequestedPayloadSchema,
  title: "New early access request",
  variant: "info"
})
