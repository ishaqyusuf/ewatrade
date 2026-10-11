import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const customerReceiptAction = z
  .object({
    action: z.literal("customer_receipt"),
    bookId: id,
    accountId: id,
    moneyAccountId: id,
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .refine(
        (value) =>
          /^[1-9]\d{0,14}$/.test(value) &&
          BigInt(value) <= 100_000_000_000_000n,
        "Receipt exceeds the transaction limit",
      ),
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"]),
    description: z.string().trim().min(1).max(400),
    reference: z.string().trim().max(160).optional(),
    moneyAlreadyReceived: z.literal(true),
  })
  .strict()
