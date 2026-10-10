import { z } from "zod"
const fields = {
  orderLineId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
}
export const serviceAuthorizeAction = z.object({
  action: z.literal("service_line_authorize"), ...fields,
}).strict()
export const serviceFulfillAction = z.object({
  action: z.literal("service_line_fulfill"), ...fields,
}).strict()
