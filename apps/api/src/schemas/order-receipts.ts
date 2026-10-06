import { receiptSettingsSchema } from "@ewatrade/order-receipts"
import { z } from "zod"

export const orderReceiptSettingsGetSchema = z
  .object({ storeId: z.string().trim().min(1).max(128).optional() })
  .strict()
export const orderReceiptSettingsSaveSchema = orderReceiptSettingsGetSchema
  .extend({
    scope: z.enum(["business", "store"]),
    settings: receiptSettingsSchema.nullable(),
  })
  .strict()
  .refine((input) => input.scope === "store" || input.settings !== null, {
    message: "Business defaults cannot be removed.",
    path: ["settings"],
  })
export const orderReceiptPrepareSchema = orderReceiptSettingsGetSchema
  .extend({
    includeImages: z.boolean().optional(),
    orderIds: z
      .array(z.string().trim().min(1).max(128))
      .min(1)
      .max(20)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select distinct Orders.",
      ),
  })
  .strict()
