import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const amountMinor = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (value) =>
      /^[1-9]\d{0,14}$/.test(value) &&
      BigInt(value) <= BigInt(100_000_000_000_000),
    "Amount exceeds the transaction limit.",
  )
const sequence = z.string().regex(/^\d{1,19}$/)
export const financeAccountActivitySchema = z
  .object({
    bookId: id,
    accountId: id,
    from: z.coerce.date(),
    through: z.coerce.date(),
    snapshotSequence: sequence.optional(),
    cursor: sequence.optional(),
    limit: z.number().int().min(1).max(50).default(30),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict()
export const financeBookSchema = z.object({ bookId: id }).strict()
export const financeFiscalCalendarSchema = financeBookSchema
  .extend({
    clientCommandId: id,
    startMonth: z.number().int().min(1).max(12),
    startDay: z.number().int().min(1).max(31),
    expectedRevision: z.number().int().min(0).max(2147483646),
    reason: z.string().trim().min(1).max(400),
  })
  .strict()
  .refine(
    ({ startMonth, startDay }) =>
      startDay <=
      ([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][startMonth - 1] ?? 0),
    "Enter a valid recurring fiscal start date.",
  )
export const financePeriodCloseChecklistSchema = financeBookSchema
  .extend({ through: z.coerce.date() })
  .strict()
export const financeSetupSchema = z
  .object({ startsAt: z.coerce.date() })
  .strict()
export const financeAccountSchema = financeBookSchema
  .extend({
    code: z.string().regex(/^[A-Z0-9_-]{1,32}$/i),
    name: z.string().trim().min(1).max(100),
    purpose: z.enum(["CASH", "BANK", "CLEARING"]),
  })
  .strict()
const money = financeBookSchema.extend({
  clientCommandId: id,
  accountId: id,
  amountMinor: z
    .string()
    .regex(/^[1-9]\d{0,14}$/)
    .refine(
      (value) =>
        /^[1-9]\d{0,14}$/.test(value) &&
        BigInt(value) <= BigInt(100_000_000_000_000),
      "Amount exceeds the transaction limit.",
    ),
  description: z.string().trim().min(1).max(500),
  effectiveAt: z.coerce.date(),
  storeId: id.optional(),
})
export const financeMoneySchema = z.discriminatedUnion("kind", [
  money
    .extend({ kind: z.literal("TRANSFER"), destinationAccountId: id })
    .strict(),
  money.extend({ kind: z.literal("OWNER_CONTRIBUTION") }).strict(),
  money.extend({ kind: z.literal("OWNER_WITHDRAWAL") }).strict(),
  money.extend({ kind: z.literal("OPENING_BALANCE") }).strict(),
])
export const financeJournalPageSchema = financeBookSchema
  .extend({
    cursor: sequence.optional(),
    snapshotSequence: sequence.optional(),
    limit: z.number().int().min(1).max(50).default(30),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict()
export const financeCommandSchema = financeBookSchema
  .extend({ clientCommandId: id })
  .strict()
export const financeMoneyReversalSchema = financeCommandSchema
  .extend({
    entryId: id,
    reason: z.string().trim().min(1).max(400),
    effectiveAt: z.coerce.date(),
  })
  .strict()
export const financeMoneyMovementSchema = financeBookSchema
  .extend({ entryId: id })
  .strict()

const billPayment = z
  .object({
    accountId: id,
    amountMinor,
    funding: z.literal("BUSINESS_ACCOUNT").optional(),
    effectiveAt: z.coerce.date(),
    reference: z.string().trim().max(160).optional(),
  })
  .strict()
const ownerBillPayment = billPayment
  .omit({ accountId: true })
  .extend({
    funding: z.literal("OWNER_CAPITAL"),
  })
  .strict()
export const financeExpenseSchema = financeCommandSchema
  .extend({
    payeeName: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    reference: z.string().trim().max(160).optional(),
    incurredAt: z.coerce.date(),
    dueAt: z.coerce.date().optional(),
    storeId: id.optional(),
    lines: z
      .array(
        z
          .object({
            accountId: id,
            description: z.string().trim().min(1).max(200),
            amountMinor,
          })
          .strict(),
      )
      .min(1)
      .max(50),
    payment: z.union([billPayment, ownerBillPayment]).optional(),
  })
  .strict()
export const financeBillPaymentSchema = z.union([
  financeCommandSchema.extend({ billId: id, ...billPayment.shape }).strict(),
  financeCommandSchema
    .extend({ billId: id, ...ownerBillPayment.shape })
    .strict(),
])
export const financeBillSchema = financeBookSchema
  .extend({ billId: id })
  .strict()
const financeCorrection = financeCommandSchema.extend({
  reason: z.string().trim().min(1).max(400),
  effectiveAt: z.coerce.date(),
})
export const financeVoidExpenseSchema = financeCorrection
  .extend({ billId: id })
  .strict()
export const financeReverseBillPaymentSchema = financeCorrection
  .extend({ paymentId: id })
  .strict()
export const financeBillsSchema = financeBookSchema
  .extend({
    query: z.string().trim().max(160).optional(),
    storeId: id.optional(),
    status: z.enum(["UNPAID", "PARTIAL", "PAID", "VOID"]).optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
    direction: z.enum(["forward", "backward"]).optional(),
    sort: z
      .object({
        field: z.enum([
          "incurredAt",
          "description",
          "payeeName",
          "totalMinor",
          "paidMinor",
        ]),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .optional(),
  })
  .strict()
export const financeCategorySchema = financeAccountSchema.omit({
  purpose: true,
})
export const financeCashCountSchema = financeCommandSchema
  .extend({
    accountId: id,
    asOf: z.coerce.date(),
    observedBalanceMinor: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (value) =>
          /^(0|[1-9]\d{0,18})$/.test(value) &&
          BigInt(value) <= BigInt("9223372036854775807"),
        "Cash count exceeds the supported balance limit.",
      ),
    reference: z.string().trim().min(1).max(200),
  })
  .strict()
export const financeCashCountDetailSchema = financeBookSchema
  .extend({ countId: id })
  .strict()
export const financeCashCountsSchema = financeBookSchema
  .extend({
    accountId: id.optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict()

export const financeReportsSchema = z
  .object({
    bookId: id,
    from: z.coerce.date(),
    through: z.coerce.date(),
    snapshotSequence: sequence.optional(),
  })
  .strict()

export const financePeriodSchema = z.discriminatedUnion("action", [
  financeCommandSchema
    .extend({
      action: z.literal("CLOSE"),
      through: z.coerce.date(),
      reason: z.string().trim().min(1).max(400),
      expectedSnapshotSequence: sequence,
    })
    .strict(),
  financeCommandSchema
    .extend({
      action: z.literal("REOPEN"),
      periodId: id,
      reason: z.string().trim().min(1).max(400),
      expectedSnapshotSequence: sequence,
    })
    .strict(),
])

export const financeCashAdjustmentSchema = financeCommandSchema
  .extend({
    countId: id,
    expectedSnapshotSequence: sequence,
    reason: z.string().trim().min(1).max(400),
  })
  .strict()
export const financeCashAdjustmentReversalSchema = financeCommandSchema
  .extend({
    entryId: id,
    expectedSnapshotSequence: sequence,
    reason: z.string().trim().min(1).max(400),
    effectiveAt: z.coerce.date(),
  })
  .strict()
