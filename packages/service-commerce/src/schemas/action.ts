import { z } from "zod"

export const SERVICE_COMMERCE_ACTIONS = [
  "request_quote",
  "book",
  "pay_now",
  "pick_up",
  "delivery",
  "talk_to_staff",
  "reschedule",
  "cancel",
] as const

export const serviceCommerceActionSchema = z.enum(SERVICE_COMMERCE_ACTIONS)

export type ServiceCommerceAction = z.infer<typeof serviceCommerceActionSchema>
