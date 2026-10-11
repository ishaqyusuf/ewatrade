import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const amountMinor = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (value) =>
      /^[1-9]\d{0,14}$/.test(value) && BigInt(value) <= 100_000_000_000_000n,
    "Amount exceeds the transaction limit",
  )
export const customerCreditApplyAction = z
  .object({
    action: z.literal("customer_credit_apply"),
    bookId: id,
    accountId: id,
    creditEntryId: id,
    chargeEntryId: id,
    amountMinor,
  })
  .strict()
export const customerAllocationReleaseAction = z
  .object({
    action: z.literal("customer_allocation_release"),
    bookId: id,
    accountId: id,
    allocationId: id,
    amountMinor,
    reason: z
      .string()
      .trim()
      .min(1, "Enter a reason for releasing the allocation.")
      .max(400),
  })
  .strict()
