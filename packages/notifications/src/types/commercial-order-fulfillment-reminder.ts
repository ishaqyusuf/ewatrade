import { z } from "zod"

import { defineNotificationType } from "../notification-types"

export const commercialOrderFulfillmentReminderPayloadSchema = z.object({
  businessName: z.string().trim().min(1),
  customerName: z.string().trim().min(1).nullable(),
  deliveryDueLabel: z.string().trim().min(1),
  orderId: z.string().trim().min(1),
  orderNumber: z.string().trim().min(1),
  storeName: z.string().trim().min(1),
  timing: z.enum(["day_before", "same_day"]),
})

export type CommercialOrderFulfillmentReminderPayload = z.infer<
  typeof commercialOrderFulfillmentReminderPayloadSchema
>

export const commercialOrderFulfillmentReminder = defineNotificationType({
  defaultChannels: ["email"],
  defaultRecipients: ["email"],
  description: "A Commercial Order is due for delivery.",
  schema: commercialOrderFulfillmentReminderPayloadSchema,
  title: "Order fulfillment reminder",
  variant: "info",
})
