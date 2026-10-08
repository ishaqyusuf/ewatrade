import { z } from "zod"

export const orderVisibilitySchema = z
  .object({
    storeId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

export const updateOrderVisibilitySchema = orderVisibilitySchema
  .extend({
    visibility: z.enum(["OWN_SALES", "ALL_STORE_ORDERS"]).optional(),
  })
  .strict()

export const orderLookupSchema = z
  .object({
    customerId: z.string().trim().min(1).max(128).optional(),
    phone: z.string().trim().min(3).max(80).optional(),
    orderNumber: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .refine((input) => Object.values(input).filter(Boolean).length === 1, {
    message: "Choose an order number, customer, or phone number.",
  })
