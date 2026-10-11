import { z } from "zod"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
const id = z.string().trim().min(1).max(128)
const amount = z.string().regex(/^[1-9]\d{0,14}$/).refine(v => !/^[1-9]\d{0,14}$/.test(v) || BigInt(v) <= 100_000_000_000_000n, "Amount exceeds the transaction limit.")
const category = z.object({ name: z.string().max(160).refine(value => {
  try { normalizeStockCategoryName(value); return true } catch { return false }
}, "Use 1–80 visible characters for a category.") }).strict()
export const purchaseRegistrationAction = z.object({
  action: z.literal("purchase_register"), bookId: id, supplierId: id,
  description: z.string().trim().min(1).max(400), agreedAt: z.iso.datetime(),
  agreementOnly: z.literal(true),
  lines: z.array(z.object({
    balanceSourceId: id, enteredInventoryUnitId: id, expectedConfigurationVersionId: id,
    enteredQuantity: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/).refine(value => Number(value) > 0, "Quantity must be positive."),
    amountMinor: amount, description: z.string().trim().min(1).max(200),
    categories: z.array(category).min(1).max(10),
  }).strict()).min(1).max(10),
}).strict().refine(value => new Set(value.lines.map(line => line.balanceSourceId)).size === value.lines.length, "Choose each goods source once.")
.refine(value => value.lines.some(line => !/^[1-9]\d{0,14}$/.test(line.amountMinor)) || value.lines.reduce((sum,line) => sum + BigInt(line.amountMinor),0n) <= 100_000_000_000_000n, "Purchase total exceeds the transaction limit.")
