import {
  serviceCommerceDeliveryOperationSchema,
  serviceCommercePickupOperationSchema,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce/schemas"
import { z } from "zod"

export const serviceCommerceFulfillmentDetailSchema = z
  .object({
    orderId: z.string().trim().min(1).max(191),
    source: serviceCommerceSourceRefSchema,
    storeId: z.string().trim().min(1).max(191).optional(),
  })
  .strict()

const fulfillmentCommandScope = {
  orderId: z.string().trim().min(1).max(191),
  source: serviceCommerceSourceRefSchema,
  storeId: z.string().trim().min(1).max(191).optional(),
}

export const serviceCommercePickupCommandInputSchema = z
  .object({
    ...fulfillmentCommandScope,
    input: serviceCommercePickupOperationSchema,
  })
  .strict()

export const serviceCommerceDeliveryCommandInputSchema = z
  .object({
    ...fulfillmentCommandScope,
    input: serviceCommerceDeliveryOperationSchema,
  })
  .strict()
