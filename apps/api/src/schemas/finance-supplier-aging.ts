import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const sequence = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine(
    (value) =>
      !/^(0|[1-9]\d{0,18})$/.test(value) ||
      BigInt(value) <= BigInt("9223372036854775807"),
    "Sequence exceeds the supported limit.",
  )
const asOfDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "0001-01-01" &&
      value <= "9999-12-30"
    )
  }, "Choose a valid UTC as-of date.")

export const financeSupplierPayableAgingSchema = z
  .object({
    bookId: id,
    supplierId: id,
    asOfDate,
    snapshotSequence: sequence.optional(),
    cursor: z
      .object({
        sequence,
        bookId: id,
        supplierId: id,
        asOfDate,
        snapshotSequence: sequence,
      })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.cursor !== undefined &&
      (value.snapshotSequence === undefined ||
        value.cursor.bookId !== value.bookId ||
        value.cursor.supplierId !== value.supplierId ||
        value.cursor.asOfDate !== value.asOfDate ||
        value.cursor.snapshotSequence !== value.snapshotSequence)
    ) {
      context.addIssue({
        code: "custom",
        path: ["snapshotSequence"],
        message:
          "Continuation pages must keep the original aging snapshot and as-of date.",
      })
    }
  })
