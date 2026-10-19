import { z } from "zod"

// Matches the existing stock tools and bounded count/transfer/closeout read IDs.
// Never trim/normalize a saved identity into a different record or accept a URL.
const identity = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value === value.trim() &&
      value !== "." &&
      value !== ".." &&
      [...value].every((point) => {
        const code = point.codePointAt(0) ?? 0
        return (
          code >= 32 &&
          (code < 127 || code > 159) &&
          code !== 0x2028 &&
          code !== 0x2029
        )
      }) &&
      !/[:/\\?#]/.test(value) &&
      !/%[0-9a-f]{2}/i.test(value) &&
      !/^www\./i.test(value),
    "Keep the exact saved stock record identity.",
  )

/** Navigation provenance only. Current protected reads derive actor and grants. */
const origin = z.object({ tenantId: identity, storeId: identity }).strict()

export const stockOperationReadTargetSchema = z
  .object({
    kind: z.literal("stock_operation"),
    operationId: identity,
    origin,
  })
  .strict()
export const stockCountReadTargetSchema = z
  .object({
    kind: z.literal("stock_count"),
    stockCountId: identity,
    origin,
  })
  .strict()
export const stockTransferReadTargetSchema = z
  .object({
    kind: z.literal("stock_transfer"),
    transferId: identity,
    origin,
  })
  .strict()
export const inventoryCloseoutReadTargetSchema = z
  .object({
    kind: z.literal("inventory_closeout"),
    closeoutId: identity,
    origin,
  })
  .strict()
export const stockReadTargetSchema = z.discriminatedUnion("kind", [
  stockOperationReadTargetSchema,
  stockCountReadTargetSchema,
  stockTransferReadTargetSchema,
  inventoryCloseoutReadTargetSchema,
])
export type StockReadTarget = z.infer<typeof stockReadTargetSchema>
