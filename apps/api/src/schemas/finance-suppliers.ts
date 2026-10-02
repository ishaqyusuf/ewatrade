import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const command = z.object({ bookId: id, clientCommandId: id }).strict()
const amountMinor = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (value) =>
      !/^[1-9]\d{0,14}$/.test(value) ||
      BigInt(value) <= BigInt(100_000_000_000_000),
    "Amount exceeds the transaction limit.",
  )
const sequence = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine(
    (value) =>
      !/^(0|[1-9]\d{0,18})$/.test(value) ||
      BigInt(value) <= BigInt("9223372036854775807"),
    "Sequence exceeds the supported limit.",
  )

export const financeSupplierCreateSchema = command
  .extend({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
    name: z.string().trim().min(1).max(160),
  })
  .strict()

export const financeSupplierOpeningSchema = command
  .extend({
    supplierId: id,
    kind: z.enum(["PAYABLE", "ADVANCE"]),
    amountMinor,
    description: z.string().trim().min(1).max(400),
    effectiveAt: z.coerce.date(),
  })
  .strict()

export const financeSupplierAdvanceSchema = command
  .extend({
    supplierId: id,
    moneyAccountId: id,
    amountMinor,
    description: z.string().trim().min(1).max(400),
    effectiveAt: z.coerce.date(),
  })
  .strict()

export const financeSupplierReversalSchema = command
  .extend({
    entryId: id,
    reason: z.string().trim().min(1).max(400),
    effectiveAt: z.coerce.date(),
  })
  .strict()

export const financeSuppliersSchema = z
  .object({
    bookId: id,
    query: z.string().trim().max(160).optional(),
    cursor: id.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()

export const financeSupplierStatementSchema = z
  .object({
    bookId: id,
    supplierId: id,
    snapshotSequence: sequence.optional(),
    cursor: sequence.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.cursor !== undefined && value.snapshotSequence === undefined) {
      context.addIssue({
        code: "custom",
        path: ["snapshotSequence"],
        message:
          "Continuation pages must keep the original statement snapshot.",
      })
    }
  })
