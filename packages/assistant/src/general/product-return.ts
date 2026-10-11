import { z } from "zod"

export const productLineReturnAction = z.object({
  action: z.literal("product_line_return"),
  orderLineId: z.string().trim().min(1).max(128),
  quantity: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/).refine(value => /[1-9]/.test(value), "Quantity must be positive"),
  disposition: z.enum(["restock", "damaged", "quarantine", "no_restock"]),
  destinationBalanceSourceId: z.string().trim().min(1).max(128).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict().refine(value => value.disposition === "restock" || value.destinationBalanceSourceId === undefined,
  "Only restock accepts a destination.")
