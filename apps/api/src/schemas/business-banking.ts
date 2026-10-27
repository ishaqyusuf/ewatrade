import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const token = z.string().min(1).max(220)
const operationId = z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/)
const amount = z.number().int().positive().max(100_000_000)
export const manualBankDetailsSchema = z
  .object({
    bookId: id,
    accountId: id,
    bankName: z.string().trim().min(1).max(100),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/),
    accountHolder: z.string().trim().min(1).max(160),
  })
  .strict()
export const createManualBankAccountSchema = manualBankDetailsSchema
  .omit({ accountId: true })
  .extend({
    name: z.string().trim().min(1).max(100),
    clientAccountId: operationId,
  })
  .strict()
export const createBusinessPaymentLinkSchema = z
  .object({
    orderId: id,
    bankAccountId: id,
    clientLinkId: operationId,
    amountMinor: amount.optional(),
    allowPartial: z.boolean().default(false),
    lifetimeMinutes: z.number().int().min(10).max(4320).default(1440),
  })
  .strict()
export const publicBusinessPaymentLinkSchema = z.object({ token }).strict()
export const prepareManualPaymentReportSchema = z
  .object({
    token,
    clientReportId: operationId,
    payerName: z.string().trim().min(1).max(160),
    claimedAmountMinor: amount,
    receipt: z
      .object({
        contentType: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ]),
        contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z
          .number()
          .int()
          .min(1)
          .max(4 * 1024 * 1024),
      })
      .strict()
      .optional(),
  })
  .strict()
export const manualReportTokenSchema = z.object({ reportToken: token }).strict()
export const manualReportIdSchema = z.object({ reportId: id }).strict()
export const manualReportPageSchema = z
  .object({
    beforeId: id.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
export const reviewManualPaymentReportSchema = z
  .object({
    reportId: id,
    expectedRevision: z.number().int().positive(),
    outcome: z.enum(["received", "not_received"]),
    receivedAmountMinor: amount.optional(),
    moneyAccountId: id.optional(),
    receivedAt: z.coerce.date().optional(),
    reference: z.string().trim().max(160).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === "not_received" && !value.note)
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Add a reason for the customer.",
      })
    if (
      value.outcome === "received" &&
      (!value.receivedAmountMinor || !value.moneyAccountId || !value.receivedAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter the received amount, account and date.",
      })
  })
