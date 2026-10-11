import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const amount = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (value) =>
      /^[1-9]\d{0,14}$/.test(value) && BigInt(value) <= 100_000_000_000_000n,
    "Amount exceeds the transaction limit",
  )
const common = {
  bookId: id,
  amountMinor: amount,
  effectiveAt: z.iso.datetime(),
  description: z.string().trim().min(1).max(400),
}
export const supplierAdvanceAction = z
  .object({
    ...common,
    action: z.literal("supplier_advance"),
    supplierId: id,
    moneyAccountId: id,
    paymentAlreadyMade: z.literal(true),
  })
  .strict()
export const supplierAdvanceAllocateAction = z
  .object({
    ...common,
    action: z.literal("supplier_advance_allocate"),
    billId: id,
    advanceEntryId: id,
    allocationConfirmed: z.literal(true),
  })
  .strict()
export const purchasePaymentAction = z
  .object({
    ...common,
    action: z.literal("purchase_payment"),
    billId: id,
    moneyAccountId: id,
    reference: z.string().trim().max(160).optional(),
    paymentAlreadyMade: z.literal(true),
  })
  .strict()
export const supplierSettlementDraftInstructions =
  " When supplier_advance, supplier_advance_allocate or purchase_payment is available, resolve the exact supplier and existing purchase invoice with readSuppliers/readSupplierStatement/readPurchaseBill, and the active business account with readMoneyAccounts. A paid advance is separate unallocated supplier credit: require paymentAlreadyMade=true and do not automatically allocate it or net it against a payable. For allocation, inspect the exact active original advance entry, resolve the same supplier's exact invoice, and require allocationConfirmed=true. Never guess an advance omitted from bounded statement history; use continuations. Allocation applies existing supplier funds, moves no cash and creates no purchase cost or stock. Purchase payment records money already paid against the existing actual supplier invoice: require paymentAlreadyMade=true, and allow partial settlement within the remaining payable. Never substitute a new purchase, expense or advance for paying an existing invoice. Clarify ambiguous supplier, account, amount, date or invoice before drafting. Use exact amounts and source IDs from authorized tools. None of these actions send money, infer invoice/ownership/physical arrival, or verify bank settlement."
