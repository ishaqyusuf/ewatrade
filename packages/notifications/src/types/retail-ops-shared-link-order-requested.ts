import { z } from "zod"

import { defineNotificationType } from "../notification-types"

export const retailOpsSharedLinkOrderRecipientSchema = z.object({
  displayName: z.string().trim().min(1).nullable().optional(),
  email: z.string().email(),
})

export const retailOpsSharedLinkOrderRequestedPayloadSchema = z.object({
  businessName: z.string().trim().min(1),
  customerEmail: z.string().email(),
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().min(1).nullable().optional(),
  merchantRecipients: z.array(retailOpsSharedLinkOrderRecipientSchema),
  notes: z.string().trim().min(1).nullable().optional(),
  orderId: z.string().trim().min(1),
  orderNumber: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  productUrl: z.string().url().nullable().optional(),
  quantity: z.number().int().positive(),
  totalFormatted: z.string().trim().min(1),
  unitName: z.string().trim().min(1),
})

export type RetailOpsSharedLinkOrderRequestedPayload = z.infer<
  typeof retailOpsSharedLinkOrderRequestedPayloadSchema
>

export const retailOpsSharedLinkOrderRequested = defineNotificationType({
  defaultChannels: ["email", "in_app"],
  defaultRecipients: ["email"],
  description: "A customer submitted a pending order request from a product share link.",
  schema: retailOpsSharedLinkOrderRequestedPayloadSchema,
  title: "New product-link order request",
  variant: "info",
})
