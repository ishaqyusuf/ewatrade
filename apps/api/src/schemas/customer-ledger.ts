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
const revision = z.string().regex(/^(0|[1-9]\d{0,18})$/)
const currencyCode = z.string().regex(/^[A-Z]{3}$/)
const date = z.coerce.date()
const paymentMethod = z.enum(["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"])

const command = z
  .object({
    bookId: id,
    clientCommandId: id,
  })
  .strict()

export const customerLedgerEnsureAccountSchema = z
  .object({ customerId: id, currencyCode })
  .strict()

export const customerLedgerOpeningSchema = command
  .extend({
    accountId: id,
    direction: z.enum(["DEBT", "CREDIT"]),
    amountMinor,
    reason: z.string().trim().min(1).max(400),
  })
  .strict()

/** Receipts are timestamped by the repository at server-now; clients cannot backdate. */
export const customerLedgerReceiptSchema = command
  .extend({
    accountId: id,
    moneyAccountId: id,
    amountMinor,
    method: paymentMethod,
    reference: z.string().trim().max(160).optional(),
    description: z.string().trim().min(1).max(400),
    storeId: id.optional(),
  })
  .strict()

export const customerLedgerApplyCreditSchema = command
  .extend({
    accountId: id,
    expectedRevision: revision,
    creditEntryId: id,
    chargeEntryId: id,
    amountMinor,
  })
  .strict()

export const customerLedgerReleaseAllocationSchema = command
  .extend({
    accountId: id,
    expectedRevision: revision,
    allocationId: id,
    amountMinor,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()

export const customerLedgerRefundCreditSchema = command
  .extend({
    accountId: id,
    expectedRevision: revision,
    creditEntryId: id,
    amountMinor,
    moneyAccountId: id,
    method: paymentMethod,
    reference: z.string().trim().max(160).optional(),
    reason: z.string().trim().min(1).max(400),
    effectiveAt: date,
  })
  .strict()

export const customerLedgerReverseEntrySchema = command
  .extend({
    accountId: id,
    entryId: id,
    expectedRevision: revision,
    reason: z.string().trim().min(1).max(400),
    effectiveAt: date,
  })
  .strict()

export const customerLedgerStatementSchema = z
  .object({
    accountId: id,
    snapshotSequence: revision.optional(),
    afterSequence: revision.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.afterSequence !== undefined &&
      value.snapshotSequence === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["snapshotSequence"],
        message:
          "Continuation pages must keep the original statement snapshot.",
      })
    }
  })

export const customerLedgerSourcesSchema = z
  .object({
    accountId: id,
    side: z.enum(["CREDIT", "DEBIT"]),
    expectedRevision: revision.optional(),
    afterSequence: revision.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.afterSequence !== undefined &&
      value.expectedRevision === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message:
          "Source continuation pages require the reviewed account revision.",
      })
    }
  })

export const customerLedgerCommandStatusSchema = z
  .object({ accountId: id, clientCommandId: id })
  .strict()

export const customerLedgerAccountsSchema = z
  .object({
    customerId: id,
    currencyCode: currencyCode.optional(),
    afterCurrency: currencyCode.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()

export const customerLedgerAccountDetailSchema = z
  .object({ accountId: id })
  .strict()

export const customerLedgerEntryDetailSchema = z
  .object({
    accountId: id,
    entryId: id,
    expectedRevision: revision.optional(),
    afterAllocationId: id.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.afterAllocationId !== undefined &&
      value.expectedRevision === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message:
          "Allocation continuation pages require the reviewed account revision.",
      })
    }
  })

/** Current allocation history always carries the reviewed account revision. */
export const customerLedgerAllocationHistorySchema = z
  .object({
    accountId: id,
    allocationId: id,
    expectedRevision: revision,
    afterSequence: revision.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()

export const customerLedgerReceivablesSchema = z
  .object({
    query: z.string().trim().max(160).optional(),
    cursor: id.optional(),
    // useInfiniteQuery adds the paging direction to the input.
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict()

export const customerFundsRefundRequestSchema = command
  .extend({
    accountId: id,
    expectedRevision: revision,
    creditEntryId: id,
    amountMinor,
    reason: z.string().trim().min(1).max(400),
    destination: z
      .object({
        bankCode: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{1,32}$/)
          .optional(),
        bankName: z
          .string()
          .trim()
          .min(2)
          .max(120)
          .refine(
            (value) =>
              Array.from(value).every(
                (character) =>
                  character.charCodeAt(0) >= 32 &&
                  character.charCodeAt(0) !== 127,
              ),
            "Enter a valid bank name.",
          )
          .optional(),
        accountNumber: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9]{6,34}$/),
        accountName: z
          .string()
          .trim()
          .min(2)
          .max(160)
          .refine(
            (value) =>
              Array.from(value).every(
                (character) =>
                  character.charCodeAt(0) >= 32 &&
                  character.charCodeAt(0) !== 127,
              ),
            "Enter a valid account name.",
          ),
      })
      .strict()
      .refine((value) => Boolean(value.bankName || value.bankCode), {
        path: ["bankName"],
        message: "Enter the bank name.",
      }),
  })
  .strict()
export const customerFundsRefundChangeSchema = command
  .extend({
    accountId: id,
    expectedRevision: revision,
    requestId: id,
    expectedVersion: z.number().int().positive(),
  })
  .strict()
export const customerFundsRefundReserveSchema = customerFundsRefundChangeSchema
  .extend({
    expectedDestinationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    identityReviewAttested: z.literal(true),
  })
  .strict()
export const customerFundsRefundCompleteSchema = customerFundsRefundChangeSchema
  .extend({
    moneyAccountId: id,
    outgoingReference: z.string().trim().min(1).max(160),
    effectiveAt: date,
  })
  .strict()
export const customerFundsRefundListSchema = z
  .object({
    accountId: id.optional(),
    status: z
      .enum(["REQUESTED", "RESERVED", "COMPLETED", "CANCELLED"])
      .optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
export const customerFundsRefundDetailSchema = z
  .object({ requestId: id })
  .strict()

export const customerFundsRefundNeedDetailsSchema =
  customerFundsRefundChangeSchema
    .extend({ note: z.string().trim().min(1).max(400) })
    .strict()
export const customerOrderFundsReturnSchema = command
  .extend({
    accountId: id,
    expectedRevision: revision,
    orderId: id,
    storeId: id,
    reason: z.string().trim().min(1).max(400),
    creditReturns: z
      .array(z.object({ allocationId: id, amountMinor }).strict())
      .max(50)
      .default([]),
    cashReturn: z
      .object({
        amountMinor: z.number().int().positive().max(100_000_000),
        method: z.enum(["cash", "bank_transfer", "card", "pos", "other"]),
        reference: z.string().trim().max(160).optional(),
        moneyAccountId: id.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.creditReturns.length && !value.cashReturn)
      context.addIssue({
        code: "custom",
        path: ["creditReturns"],
        message: "Select an original credit or cash return source.",
      })
    if (
      new Set(value.creditReturns.map((row) => row.allocationId)).size !==
      value.creditReturns.length
    )
      context.addIssue({
        code: "custom",
        path: ["creditReturns"],
        message: "Select each original credit source once.",
      })
  })

export const customerOrderReturnReviewSchema = z
  .object({ orderId: id })
  .strict()
