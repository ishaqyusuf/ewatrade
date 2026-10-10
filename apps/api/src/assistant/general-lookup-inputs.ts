import { z } from "zod"
import { catalogListItemsSchema } from "../schemas/catalog"
import { orderLookupPageSchema } from "../schemas/order-visibility"
import { commercialOrderStatusSchema } from "../schemas/orders"
export const generalCustomerPageInput = z
  .object({
    query: z.string().trim().min(1).max(160).optional(),
    cursor: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
export const generalOrderPageInput = z
  .object({
    query: z.string().trim().min(1).max(160).optional(),
    queryMode: z.enum(["all", "customer"]).optional(),
    cursor: z.string().trim().min(1).max(128).optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    statuses: z.array(commercialOrderStatusSchema).min(1).max(9).optional(),
  })
  .strict()
  .refine(
    (input) =>
      !input.createdAfter ||
      !input.createdBefore ||
      Date.parse(input.createdAfter) < Date.parse(input.createdBefore),
    "End must follow start",
  )

export const generalCatalogPageInput = catalogListItemsSchema.extend({
  query: z.string().trim().min(1).max(160).optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
})

export const generalOpenOrderInput = z
  .object({
    customerId: orderLookupPageSchema.shape.customerId,
    phone: orderLookupPageSchema.shape.phone,
    orderNumber: orderLookupPageSchema.shape.orderNumber,
    cursor: orderLookupPageSchema.shape.cursor,
  })
  .strict()
  .refine(
    (input) =>
      [input.customerId, input.phone, input.orderNumber].filter(Boolean)
        .length === 1,
    "Choose exactly one order identity.",
  )
