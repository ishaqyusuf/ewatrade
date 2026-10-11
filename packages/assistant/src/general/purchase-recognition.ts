import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const amount = z.string().regex(/^[1-9]\d{0,14}$/).refine(
  value => !/^[1-9]\d{0,14}$/.test(value) || BigInt(value) <= 100_000_000_000_000n,
  "Amount exceeds the transaction limit.",
)

export const purchaseRecognitionAction = z.object({
  action: z.literal("purchase_recognize"),
  bookId: id,
  recognitionId: id,
  stage: z.enum(["INVOICE", "OWNERSHIP"]),
  effectiveAt: z.iso.datetime(),
  reference: z.string().trim().min(1).max(160),
  factConfirmed: z.literal(true),
  invoiceAmountMinor: amount.optional(),
  dueAt: z.iso.datetime().optional(),
}).strict().refine(
  value => value.stage === "INVOICE"
    ? value.invoiceAmountMinor !== undefined
    : value.invoiceAmountMinor === undefined && value.dueAt === undefined,
  "Only invoice recognition requires an invoice amount and permits a due date.",
).refine(
  value => value.dueAt === undefined || new Date(value.dueAt) >= new Date(value.effectiveAt),
  "The invoice due date cannot precede its recognition date.",
)

export const purchaseRecognitionDraftInstructions =
  " When purchase_recognize is available, inspect the exact existing agreement with readPurchaseRecognition. Invoice and ownership are separate facts: require the user's explicit confirmation of the chosen fact, its date and source reference, and factConfirmed=true. For INVOICE require the stated invoice amount to match all immutable agreed goods costs; clarify differences rather than changing the agreement. OWNERSHIP has no invoice amount or due date. Never infer ownership from an invoice, shipping or arrival. This action does not record physical receipt, split deliveries, changed costs, supplier settlement or send money; use their separate supported workflows. Do not replace an existing agreement or repeat an existing stage."
