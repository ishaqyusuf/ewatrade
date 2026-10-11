import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const amount = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (value) =>
      /^[1-9]\d{0,14}$/.test(value) && BigInt(value) <= 100_000_000_000_000n,
    "Amount exceeds the transaction limit",
  )
const paymentBase = {
  amountMinor: amount,
  effectiveAt: z.iso.datetime(),
  reference: z.string().trim().max(160).optional(),
  paymentAlreadyMade: z.literal(true),
}
export const expenseAction = z
  .object({
    action: z.literal("expense_record"),
    bookId: id,
    payeeName: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(400),
    reference: z.string().trim().max(160).optional(),
    incurredAt: z.iso.datetime(),
    dueAt: z.iso.datetime().optional(),
    expenseAlreadyIncurred: z.literal(true),
    lines: z
      .array(
        z
          .object({
            accountId: id,
            description: z.string().trim().min(1).max(200),
            amountMinor: amount,
          })
          .strict(),
      )
      .min(1)
      .max(50),
    payment: z
      .discriminatedUnion("funding", [
        z
          .object({
            ...paymentBase,
            funding: z.literal("BUSINESS_ACCOUNT"),
            accountId: id,
          })
          .strict(),
        z
          .object({ ...paymentBase, funding: z.literal("OWNER_CAPITAL") })
          .strict(),
      ])
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dueAt && Date.parse(value.dueAt) < Date.parse(value.incurredAt))
      ctx.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Due date cannot precede the expense.",
      })
    if (value.lines.some((line) => !/^[1-9]\d{0,14}$/.test(line.amountMinor)))
      return
    const total = value.lines.reduce(
      (sum, line) => sum + BigInt(line.amountMinor),
      0n,
    )
    if (total > 100_000_000_000_000n)
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Expense total exceeds the transaction limit.",
      })
    if (value.payment) {
      if (Date.parse(value.payment.effectiveAt) < Date.parse(value.incurredAt))
        ctx.addIssue({
          code: "custom",
          path: ["payment", "effectiveAt"],
          message: "Payment cannot precede the expense.",
        })
      if (
        /^[1-9]\d{0,14}$/.test(value.payment.amountMinor) &&
        BigInt(value.payment.amountMinor) > total
      )
        ctx.addIssue({
          code: "custom",
          path: ["payment", "amountMinor"],
          message: "Payment exceeds the expense total.",
        })
    }
  })
