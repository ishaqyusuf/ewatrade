import { purchaseRecognitionReversalDraftInstructions } from "./purchase-recognition-reversal"
import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const amount = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (value) =>
      !/^[1-9]\d{0,14}$/.test(value) || BigInt(value) <= 100_000_000_000_000n,
    "Amount exceeds the transaction limit.",
  )

export const purchaseRecognitionAction = z
  .object({
    action: z.literal("purchase_recognize"),
    bookId: id,
    recognitionId: id,
    stage: z.enum(["INVOICE", "OWNERSHIP", "RECEIPT"]),
    effectiveAt: z.iso.datetime(),
    reference: z.string().trim().min(1).max(160),
    factConfirmed: z.literal(true),
    invoiceAmountMinor: amount.optional(),
    dueAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.stage === "INVOICE"
        ? value.invoiceAmountMinor !== undefined
        : value.invoiceAmountMinor === undefined && value.dueAt === undefined,
    "Only invoice recognition requires an invoice amount and permits a due date.",
  )
  .refine(
    (value) =>
      value.dueAt === undefined ||
      new Date(value.dueAt) >= new Date(value.effectiveAt),
    "The invoice due date cannot precede its recognition date.",
  )

const purchaseRecognitionBaseDraftInstructions =
  " When purchase_recognize is available, inspect the exact existing agreement with readPurchaseRecognition. Invoice, ownership and physical receipt are separate facts: require the user's explicit confirmation of the chosen fact, its date and source reference, and factConfirmed=true. For INVOICE require the stated invoice amount to match all immutable agreed goods costs; clarify differences rather than changing the agreement. OWNERSHIP and RECEIPT have no invoice amount or due date. For RECEIPT require explicit confirmation that all original agreed goods physically arrived at their original Store and are owned. Review uses all original goods, exact current stock revisions and original allocated costs; never supply replacement lines, costs or stock revisions. Never infer ownership from an invoice or shipping; do not infer physical receipt from ownership or an invoice. This action does not record split deliveries, changed costs, supplier settlement or send money; use their separate supported workflows. Do not replace an existing agreement or repeat an existing stage."

export const purchaseRecognitionDraftInstructions =
  purchaseRecognitionBaseDraftInstructions + purchaseRecognitionReversalDraftInstructions
