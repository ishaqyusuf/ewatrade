import { z } from "zod"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((value) => Number(value) > 0, "Quantity must be positive")
const category = z
  .object({
    name: z
      .string()
      .max(160)
      .refine((value) => {
        try {
          normalizeStockCategoryName(value)
          return true
        } catch {
          return false
        }
      }, "Use 1–80 visible characters for a category."),
  })
  .strict()

export const stockAdjustmentAction = z
  .object({
    action: z.literal("stock_adjust"),
    balanceSourceId: id,
    enteredInventoryUnitId: id,
    enteredQuantity: quantity,
    direction: z.enum(["increase", "decrease"]),
    purpose: z.enum(["adjustment", "waste"]),
    reason,
    categories: z.array(category).min(1).max(10),
    effectiveAt: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (value) => value.purpose !== "waste" || value.direction === "decrease",
    "Waste must decrease stock.",
  )

export const stockCorrectionAction = z
  .object({
    action: z.literal("stock_correct"),
    targetOperationId: id,
    reason,
    corrections: z
      .array(
        z
          .object({ movementId: id, correctedEnteredQuantity: quantity })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.corrections.map((entry) => entry.movementId)).size ===
      value.corrections.length,
    "Each original movement must appear once.",
  )
