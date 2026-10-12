import { z } from "zod"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
const id = z.string().trim().min(1).max(128)
const amount = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .refine(
    (v) => !/^[1-9]\d{0,14}$/.test(v) || BigInt(v) <= 100_000_000_000_000n,
    "Amount exceeds the transaction limit.",
  )
const category = z.union([
  z
    .object({ categoryNameId: z.number().int().positive().max(2_147_483_647) })
    .strict(),
  z
    .object({
      name: z
        .string()
        .max(160)
        .refine((v) => {
          try {
            normalizeStockCategoryName(v)
            return true
          } catch {
            return false
          }
        }, "Use 1–80 visible characters for a category."),
    })
    .strict(),
])
export const purchaseRecordAction = z
  .object({
    action: z.literal("purchase_record"),
    bookId: id,
    supplierId: id,
    description: z.string().trim().min(1).max(400),
    reference: z.string().trim().max(160).optional(),
    incurredAt: z.iso.datetime(),
    dueAt: z.iso.datetime().optional(),
    invoiceOwnershipReceiptConfirmed: z.literal(true),
    lines: z
      .array(
        z
          .object({
            balanceSourceId: id,
            enteredInventoryUnitId: id,
            expectedConfigurationVersionId: id,
            expectedBalanceRevision: z.number().int().min(0).max(2_147_483_646),
            enteredQuantity: z
              .string()
              .regex(/^\d{1,12}(\.\d{1,6})?$/)
              .refine((v) => Number(v) > 0, "Quantity must be positive."),
            amountMinor: amount,
            description: z.string().trim().min(1).max(200),
            categories: z.array(category).min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.lines.map((l) => l.balanceSourceId)).size === v.lines.length,
    "Choose each goods source once.",
  )
  .refine(
    (v) => !v.dueAt || new Date(v.dueAt) >= new Date(v.incurredAt),
    "Due date cannot precede the bill date.",
  )
  .refine(
    (v) =>
      v.lines.some((l) => !/^[1-9]\d{0,14}$/.test(l.amountMinor)) ||
      v.lines.reduce((s, l) => s + BigInt(l.amountMinor), 0n) <=
        100_000_000_000_000n,
    "Purchase total exceeds the transaction limit.",
  )
export const purchaseRecordingDraftInstructions =
  " When purchase_record is available, resolve the exact supplier and Book using readSuppliers, and the active Store's goods, entered units, configuration versions and current balance revisions using authorized stock tools. Ask naturally for any missing facts; never ask for internal IDs or JSON. Use this combined command only after the merchant explicitly confirms that the supplier invoice exists and all exact goods are received and owned; require invoiceOwnershipReceiptConfirmed=true. An agreement alone uses purchase_register; separately timed invoice, ownership or delivery facts use purchase_recognize. Clarify date, due date, quantity, cost and categories for each of 1–10 distinct goods sources. Explain that supplier payable, physical stock and original-cost valuation are recorded together; no payment, money transfer or allocation occurs. Do not substitute this for paying an existing invoice or assume receipt/ownership from an invoice. Existing opening-cost gaps remain UNKNOWN. No caller authority, Store, command identity or source proof is accepted."
