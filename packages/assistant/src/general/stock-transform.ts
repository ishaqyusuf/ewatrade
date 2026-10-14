import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((value) => /[1-9]/.test(value), "Quantity must be positive")

/**
 * Repack stock between two existing packaged-stock balances of the same
 * Product and variant in the active Store. Only the source quantity is
 * drafted; the server derives the exact target quantity from the pack
 * factors and never accepts one from the model.
 */
export const stockPackageTransformAction = z
  .object({
    action: z.literal("stock_package_transform"),
    sourceBalanceSourceId: id,
    targetBalanceSourceId: id,
    sourceQuantity: quantity,
    reason,
  })
  .strict()
export type StockPackageTransform = z.infer<typeof stockPackageTransformAction>
