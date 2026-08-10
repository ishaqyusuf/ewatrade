import { z } from "zod"

import { serviceCommerceActionSchema } from "./action"
import { serviceCommerceCapabilityStateSchema } from "./capability"
import { serviceCommerceSourceRefSchema } from "./source"

export const SERVICE_COMMERCE_REQUEST_STATES = [
  "received",
  "needs_clarification",
  "ready_to_quote",
  "quoted",
  "converted",
  "declined",
  "withdrawn",
  "expired",
] as const

export const SERVICE_COMMERCE_PRODUCT_DEMAND_REASONS = [
  "needs_identification",
  "needs_availability_confirmation",
  "needs_quote",
] as const

export const SERVICE_COMMERCE_EXACT_PRODUCT_COMMANDS = [
  "add_to_cart",
  "create_commercial_order",
] as const

export const serviceCommerceRequestStateSchema = z.enum(
  SERVICE_COMMERCE_REQUEST_STATES,
)
export const serviceCommerceProductDemandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      command: z.enum(SERVICE_COMMERCE_EXACT_PRODUCT_COMMANDS),
      kind: z.literal("exact_product"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("commerce_inquiry"),
      reason: z.enum(SERVICE_COMMERCE_PRODUCT_DEMAND_REASONS),
    })
    .strict(),
])

export const serviceCommerceCustomerRequestProjectionSchema = z
  .object({
    allowedCommands: serviceCommerceActionSchema.array(),
    capabilities: serviceCommerceCapabilityStateSchema.array(),
    source: serviceCommerceSourceRefSchema,
    state: serviceCommerceRequestStateSchema,
    store: z
      .object({
        id: z.string().trim().min(1).max(191),
        name: z.string().trim().min(1).max(191),
      })
      .strict(),
    summary: z.string().trim().min(1).max(500),
  })
  .strict()

export type ServiceCommerceCustomerRequestProjection = z.infer<
  typeof serviceCommerceCustomerRequestProjectionSchema
>
export type ServiceCommerceProductDemand = z.infer<
  typeof serviceCommerceProductDemandSchema
>
export type ServiceCommerceRequestState = z.infer<
  typeof serviceCommerceRequestStateSchema
>
