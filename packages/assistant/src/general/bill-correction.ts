import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const correction = {
  bookId: id,
  effectiveAt: z.iso.datetime(),
  reason: z.string().trim().min(1).max(400),
  bookkeepingOnly: z.literal(true),
}
export const expenseVoidAction = z
  .object({ ...correction, action: z.literal("expense_void"), billId: id })
  .strict()
export const billPaymentReverseAction = z
  .object({
    ...correction,
    action: z.literal("bill_payment_reverse"),
    paymentId: id,
  })
  .strict()
