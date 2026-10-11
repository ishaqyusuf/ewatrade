import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const billPaymentAction = z
  .object({
    action: z.literal("bill_payment"),
    bookId: id,
    billId: id,
    funding: z.enum(["BUSINESS_ACCOUNT", "OWNER_CAPITAL"]),
    accountId: id.optional(),
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
    reference: z.string().trim().max(160).optional(),
    paymentAlreadyMade: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.funding === "BUSINESS_ACCOUNT"
        ? !value.accountId
        : value.accountId !== undefined
    )
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Choose a business account or owner funding, not both.",
      })
  })
