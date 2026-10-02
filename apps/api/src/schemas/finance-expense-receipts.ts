import { z } from "zod"
import { financeBillSchema } from "./finance"

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const commandId = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => value.trim().length > 0)
const fileName = z
  .string()
  .max(160)
  .refine(
    (value) => !/[/\\\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value),
    "File names cannot contain paths or control characters.",
  )
  .transform((value) => value.trim())
  .refine((value) => value.length > 0 && value !== "." && value !== "..")

/** Actor/Tenant, storage paths, verdicts and upload completion are server-owned. */
const receiptScopeSchema = financeBillSchema
  .extend({ bookId: id, billId: id })
  .strict()

export const financeExpenseReceiptIntentSchema = receiptScopeSchema
  .extend({
    clientCommandId: commandId,
    originalFileName: fileName,
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    contentType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ]),
    sizeBytes: z.number().int().min(1).max(10_000_000),
  })
  .strict()

export const financeExpenseReceiptAssetSchema = receiptScopeSchema
  .extend({ assetId: id })
  .strict()

export const financeExpenseReceiptAttachSchema =
  financeExpenseReceiptAssetSchema
    .extend({ clientCommandId: commandId })
    .strict()

export const financeExpenseReceiptListSchema = receiptScopeSchema
  .extend({
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
