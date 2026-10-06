import { z } from "zod"

const cursor = z
  .object({
    at: z.string().datetime(),
    key: z
      .string()
      .min(1)
      .max(180)
      .regex(
        /^(orders|price|stock|created|product_fulfilled|service_performed):[A-Za-z0-9_-]+$/,
      ),
  })
  .strict()
export const catalogDetailSchema = z
  .object({
    itemId: z.string().min(1).max(100),
    storeId: z.string().min(1).max(100),
  })
  .strict()
export const catalogDetailPageSchema = catalogDetailSchema
  .extend({
    limit: z.number().int().min(1).max(50).default(30),
    cursor: cursor.nullish(),
    direction: z.literal("forward").optional(),
  })
  .strict()
export const catalogActivitySchema = catalogDetailPageSchema
  .extend({
    category: z.enum(["all", "catalog", "orders", "stock"]).default("all"),
  })
  .strict()
