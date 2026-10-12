import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const supplierOpeningAction = z
  .object({
    action: z.literal("supplier_opening"),
    bookId: id,
    supplierId: id,
    kind: z.enum(["PAYABLE", "ADVANCE"]),
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .refine(
        (v) => /^[1-9]\d{0,14}$/.test(v) && BigInt(v) <= 100_000_000_000_000n,
        "Amount exceeds the transaction limit",
      ),
    description: z.string().trim().min(1).max(400),
    openingBalanceConfirmed: z.literal(true),
  })
  .strict()
export const supplierOpeningDraftInstructions =
  " When supplier_opening is available, resolve the exact supplier with readSuppliers and inspect its authorized readSupplierStatement history, using bounded continuations. Never ask for internal IDs. Ask whether the amount is a pre-existing supplier payable or unallocated advance at the Finance Book's bookkeeping start, the exact amount and description, and obtain explicit opening-balance confirmation. This is not a current purchase, new payment or allocation. Only one opening of each kind is allowed per supplier, including reversed openings; never create a second opening as a correction. The server uses the Book start date and original active payable/advance and opening-equity controls. Never invent a date, money account or posting lines. Explain the reviewed date and separate payable/advance changes before confirmation. An opening changes recorded balances and opening equity; it sends no money, moves no stock, records no purchase and pays no invoice. Clarify ambiguous supplier, kind or amount before drafting."
