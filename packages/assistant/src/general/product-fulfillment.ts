import { z } from "zod"
export const productLineFulfillAction = z.object({
  action: z.literal("product_line_fulfill"),
  orderLineId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
}).strict()
