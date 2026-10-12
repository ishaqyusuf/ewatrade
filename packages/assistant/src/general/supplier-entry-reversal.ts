import { z } from "zod"
const id = z.string().trim().min(1).max(128)
export const supplierEntryReverseAction = z
  .object({
    action: z.literal("supplier_entry_reverse"),
    bookId: id,
    entryId: id,
    effectiveAt: z.iso.datetime(),
    reason: z.string().trim().min(1).max(400),
    bookkeepingOnly: z.literal(true),
  })
  .strict()
export const supplierEntryReversalDraftInstructions =
  " When supplier_entry_reverse is available, resolve the supplier with readSuppliers and the exact original entry through readSupplierStatement in the returned Book. Use bounded-history continuations; never guess an omitted entry or ask the merchant for internal IDs. This command supports only original opening payable, opening advance and paid advance entries. Purchase bills, payments, allocations and purchase facts require their distinct source corrections; do not substitute this command. Ask the correction date and reason and require explicit bookkeepingOnly=true. Reverse the whole original amount using its original accounts, never caller replacement amounts, accounts, kind or supplier. Release every consumed portion of an advance first through an explicitly requested separate action, never automatically. Explain that the original history remains: opening payable decreases its recorded liability, opening/paid advance decreases original unallocated credit, and paid advance correction increases the original recorded cash/bank/clearing account balance. This bookkeeping correction does not recover or refund money, send a transfer, alter purchase cost or move stock. Clarify ambiguous sources before drafting."
