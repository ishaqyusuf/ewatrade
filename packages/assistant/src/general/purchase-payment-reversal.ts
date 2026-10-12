import { z } from "zod"

export const purchasePaymentReverseAction = z
  .object({
    action: z.literal("purchase_payment_reverse"),
    bookId: z.string().trim().min(1).max(128),
    paymentId: z.string().trim().min(1).max(128),
    effectiveAt: z.iso.datetime(),
    reason: z.string().trim().min(1).max(400),
    bookkeepingOnly: z.literal(true),
  })
  .strict()
