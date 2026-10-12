import { supplierOpeningDraftInstructions } from "./supplier-opening"
import { supplierEntryReversalDraftInstructions } from "./supplier-entry-reversal"
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
const supplierSettlementBaseInstructions =
  " When supplier_advance, supplier_advance_allocate or purchase_payment is available, start with readSuppliers using the supplier name or code; omit bookId on the first read if unknown and keep the returned bookId. Resolve the exact supplier and existing invoice with readSupplierStatement/readPurchaseBills/readPurchaseBill, and the active business account with readMoneyAccounts in that Book. Ask naturally whether the payment was already made or the existing advance should be applied; never ask the merchant for internal IDs, Book identifiers or schema flags. A paid advance is separate unallocated supplier credit: require paymentAlreadyMade=true and do not automatically allocate it or net it against a payable. For allocation, inspect the exact active original advance entry, resolve the same supplier's exact invoice, and require allocationConfirmed=true. Never guess an advance omitted from bounded statement history; use continuations. Allocation applies existing supplier funds, moves no cash and creates no purchase cost or stock. Purchase payment records money already paid against the existing actual supplier invoice: require paymentAlreadyMade=true, and allow partial settlement within the remaining payable. Never substitute a new purchase, expense or advance for paying an existing invoice. Clarify ambiguous supplier, account, amount, date or invoice before drafting. Use exact amounts and source IDs from authorized tools. None of these actions send money, infer invoice/ownership/physical arrival, or verify bank settlement."

const supplierAllocationReleaseDraftInstructions =
  " When supplier_allocation_release is available, find the exact invoice with readPurchaseBill and inspect its original allocation and release history. Use the returned allocationId, never guess a source omitted from bounded history. Ask how much of that allocation to release, the date and reason; require releaseConfirmed=true. Explain that unallocated original supplier advance and invoice remaining payable both increase, while no cash moves, refund occurs, purchase cost or stock changes. Do not substitute payment reversal or a new advance. Clarify ambiguous allocations and use continuations before drafting."

const purchasePaymentReversalDraftInstructions =
  " When purchase_payment_reverse is available, resolve the exact recorded payment from readPurchaseBill using its owning Book and invoice. Inspect the original payment, account, date and reversal history; use continuations if the source is omitted. Ask for the correction date and reason and confirm bookkeepingOnly=true. Reverse the whole original payment amount using its original accounts; never ask for a replacement amount or funding account. Explain that the invoice payable increases while no money is recovered, refunded or transferred, no advance is released, and purchase cost and stock stay unchanged. Clarify ambiguous payments before drafting; never substitute an expense payment reversal or purchase fact reversal."

export const supplierSettlementDraftInstructions =
  supplierSettlementBaseInstructions +
  supplierAllocationReleaseDraftInstructions +
  purchasePaymentReversalDraftInstructions +
  supplierEntryReversalDraftInstructions +
  supplierOpeningDraftInstructions
