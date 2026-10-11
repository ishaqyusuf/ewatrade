import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const moneyMovementAction = z
  .object({
    action: z.literal("money_movement"),
    kind: z.enum(["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"]),
    bookId: id,
    accountId: id,
    destinationAccountId: id.optional(),
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .refine(
        (value) =>
          /^[1-9]\d{0,14}$/.test(value) &&
          BigInt(value) <= 100_000_000_000_000n,
        "Amount exceeds the transaction limit",
      ),
    description: z.string().trim().min(1).max(400),
    effectiveAt: z.iso.datetime(),
    movementAlreadyCompleted: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.kind === "TRANSFER" &&
      (!value.destinationAccountId ||
        value.destinationAccountId === value.accountId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Choose a different destination account.",
      })
    if (value.kind !== "TRANSFER" && value.destinationAccountId !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Owner funds use the business equity account.",
      })
  })
