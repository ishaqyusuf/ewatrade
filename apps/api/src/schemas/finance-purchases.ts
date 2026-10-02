import { z } from "zod"
import { financeBookSchema, financeCommandSchema } from "./finance"
import {
  financeSupplierAdvanceSchema,
  financeSupplierReversalSchema,
} from "./finance-suppliers"
import { inventorySingleBalanceOperationSchema } from "./inventory"

const id = financeBookSchema.shape.bookId
const amountMinor = financeSupplierAdvanceSchema.shape.amountMinor
const description = z.string().trim().min(1).max(400)
const purchaseLine = z
  .object({
    balanceSourceId: id,
    enteredInventoryUnitId: id,
    enteredQuantity:
      inventorySingleBalanceOperationSchema.shape.enteredQuantity,
    expectedBalanceRevision:
      inventorySingleBalanceOperationSchema.shape.expectedBalanceRevision.max(
        2_147_483_647,
      ),
    expectedConfigurationVersionId: id,
    categories: inventorySingleBalanceOperationSchema.shape.categories.unwrap(),
    amountMinor,
    description: z.string().trim().min(1).max(200),
  })
  .strict()

export const financePurchaseSchema = financeCommandSchema
  .extend({
    supplierId: id,
    storeId: id,
    description,
    reference: z.string().trim().max(160).optional(),
    incurredAt: z.coerce.date(),
    dueAt: z.coerce.date().optional(),
    lines: z.array(purchaseLine).min(1).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.lines.map((line) => line.balanceSourceId)).size !==
      value.lines.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Combine lines for the same Balance Source.",
      })
    }
    if (value.dueAt && value.dueAt < value.incurredAt) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "The due date cannot precede the purchase.",
      })
    }
    const validAmounts = value.lines.every((line) =>
      /^[1-9]\d{0,14}$/.test(line.amountMinor),
    )
    if (
      validAmounts &&
      value.lines.reduce(
        (sum, line) => sum + BigInt(line.amountMinor),
        BigInt(0),
      ) > BigInt(100_000_000_000_000)
    ) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Purchase total exceeds the transaction limit.",
      })
    }
  })

export const financePurchasePaymentSchema = financeCommandSchema
  .extend({
    billId: id,
    moneyAccountId: id,
    amountMinor,
    description,
    effectiveAt: z.coerce.date(),
    reference: z.string().trim().max(160).optional(),
  })
  .strict()

export const financePurchasePaymentReversalSchema =
  financeSupplierReversalSchema
    .omit({ entryId: true })
    .extend({ paymentId: id })
    .strict()

export const financeSupplierAllocationSchema = financeSupplierAdvanceSchema
  .omit({ supplierId: true, moneyAccountId: true })
  .extend({ billId: id, advanceEntryId: id })
  .strict()

export const financeSupplierAllocationReleaseSchema =
  financeSupplierReversalSchema
    .omit({ entryId: true })
    .extend({ allocationId: id, amountMinor })
    .strict()

export const financePurchaseDetailSchema = financeBookSchema
  .extend({ billId: id })
  .strict()

export const financePurchasesSchema = financeBookSchema
  .extend({
    supplierId: id.optional(),
    storeId: id.optional(),
    status: z.enum(["UNPAID", "PARTIAL", "PAID", "VOID"]).optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()

export const financePurchaseRegistrationSchema = financeCommandSchema
  .extend({
    supplierId: id,
    storeId: id,
    description,
    agreedAt: z.coerce.date(),
    lines: z
      .array(purchaseLine.omit({ expectedBalanceRevision: true }))
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.lines.map((line) => line.balanceSourceId)).size !==
      value.lines.length
    )
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Combine lines for the same Balance Source.",
      })
    if (
      value.lines.every((line) => /^[1-9]\d{0,14}$/.test(line.amountMinor)) &&
      value.lines.reduce(
        (sum, line) => sum + BigInt(line.amountMinor),
        BigInt(0),
      ) > BigInt(100_000_000_000_000)
    )
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Purchase total exceeds the transaction limit.",
      })
  })

export const financePurchaseRecognitionsSchema = financeBookSchema
  .extend({
    supplierId: id,
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()

export const financePurchaseRecognitionSchema = financeCommandSchema
  .extend({
    recognitionId: id,
    stage: z.enum(["INVOICE", "OWNERSHIP", "RECEIPT"]),
    effectiveAt: z.coerce.date(),
    reference: z.string().trim().min(1).max(160),
    dueAt: z.coerce.date().optional(),
    invoiceAmountMinor: amountMinor.optional(),
    receipts: z
      .array(
        z
          .object({
            lineId: id,
            expectedBalanceRevision: z.number().int().min(0).max(2_147_483_646),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.stage === "INVOICE") !==
      (value.invoiceAmountMinor !== undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["invoiceAmountMinor"],
        message: "Confirm the invoice total only for an invoice.",
      })
    if (
      value.dueAt &&
      (value.stage !== "INVOICE" || value.dueAt < value.effectiveAt)
    )
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Check the invoice due date.",
      })
    if ((value.stage === "RECEIPT") !== (value.receipts !== undefined))
      context.addIssue({
        code: "custom",
        path: ["receipts"],
        message: "Confirm stock revisions only for a physical receipt.",
      })
    if (
      value.receipts &&
      new Set(value.receipts.map((line) => line.lineId)).size !==
        value.receipts.length
    )
      context.addIssue({
        code: "custom",
        path: ["receipts"],
        message: "Confirm each original goods line once.",
      })
  })

export const financePurchaseRecognitionReversalSchema = financeCommandSchema
  .extend({
    recognitionId: id,
    eventId: id,
    effectiveAt: z.coerce.date(),
    reason: description,
  })
  .strict()

export const financePurchaseRecognitionDetailSchema = financeBookSchema
  .extend({ recognitionId: id })
  .strict()
