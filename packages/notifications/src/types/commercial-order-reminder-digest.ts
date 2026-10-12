import { z } from "zod"

import { defineNotificationType } from "../notification-types"

const digestOrderSchema = z.object({
  customerName: z.string().trim().min(1).nullable(),
  dueLabel: z.string().trim().min(1),
  orderNumber: z.string().trim().min(1),
  orderUrl: z.string().url().nullable(),
  storeName: z.string().trim().min(1),
})

export const commercialOrderReminderDigestPayloadSchema = z.object({
  attempt: z.number().int().min(1),
  businessName: z.string().trim().min(1),
  digestId: z.string().trim().min(1),
  ordersUrl: z.string().url().nullable(),
  sections: z
    .array(
      z.object({
        orders: z.array(digestOrderSchema).min(1),
        timing: z.enum(["overdue", "same_day", "day_before"]),
      }),
    )
    .min(1),
})

export type CommercialOrderReminderDigestPayload = z.infer<
  typeof commercialOrderReminderDigestPayloadSchema
>

export const commercialOrderReminderDigest = defineNotificationType({
  defaultChannels: ["email"],
  defaultRecipients: ["email"],
  description: "Daily list of Commercial Orders due, due tomorrow or overdue.",
  schema: commercialOrderReminderDigestPayloadSchema,
  title: "Order delivery digest",
  variant: "info",
})
