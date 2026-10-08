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
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict()
