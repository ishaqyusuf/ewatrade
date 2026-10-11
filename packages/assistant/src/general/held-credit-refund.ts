import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const heldCreditRefundAction = z.object({
  action: z.literal("held_credit_refund"),
  bookId: id,
  accountId: id,
  creditEntryId: id,
  moneyAccountId: id,
  amountMinor: z.string().regex(/^[1-9]\d{0,14}$/).refine(value => /^[1-9]\d{0,14}$/.test(value) && BigInt(value) <= 100_000_000_000_000n, "Refund exceeds the transaction limit"),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"]),
  effectiveAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(400),
  reference: z.string().trim().max(160).optional(),
  moneyAlreadyReturned: z.literal(true),
}).strict()
