import { z } from "zod"

export const supplierAllocationReleaseAction = z
  .object({
    action: z.literal("supplier_allocation_release"),
    bookId: z.string().trim().min(1).max(128),
    allocationId: z.string().trim().min(1).max(128),
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .refine(
        (value) =>
          /^[1-9]\d{0,14}$/.test(value) &&
          BigInt(value) <= 100_000_000_000_000n,
        "Amount exceeds the transaction limit",
      ),
    effectiveAt: z.iso.datetime(),
    reason: z.string().trim().min(1).max(400),
    releaseConfirmed: z.literal(true),
  })
  .strict()
