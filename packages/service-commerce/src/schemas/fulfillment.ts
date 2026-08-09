import { z } from "zod"

export const SERVICE_COMMERCE_FULFILLMENT_OPTIONS = [
  "none",
  "service",
  "pickup",
  "delivery",
] as const

export const serviceCommerceFulfillmentOptionSchema = z.enum(
  SERVICE_COMMERCE_FULFILLMENT_OPTIONS,
)

export type ServiceCommerceFulfillmentOption = z.infer<
  typeof serviceCommerceFulfillmentOptionSchema
>
