import { z } from "zod"

export const SERVICE_COMMERCE_CAPABILITIES = [
  "intake",
  "attachments",
  "quote",
  "booking",
  "payment",
  "pickup",
  "delivery",
  "service_completion",
  "web",
  "staff",
  "whatsapp",
  "progressive_catalog",
] as const

export const SERVICE_COMMERCE_READINESS_STATES = [
  "available",
  "setup_required",
  "restricted",
  "unavailable",
] as const

export const serviceCommerceCapabilitySchema = z.enum(
  SERVICE_COMMERCE_CAPABILITIES,
)
export const serviceCommerceReadinessStateSchema = z.enum(
  SERVICE_COMMERCE_READINESS_STATES,
)
export const serviceCommerceCapabilityStateSchema = z
  .object({
    capability: serviceCommerceCapabilitySchema,
    readiness: serviceCommerceReadinessStateSchema,
  })
  .strict()

export type ServiceCommerceCapability = z.infer<
  typeof serviceCommerceCapabilitySchema
>
export type ServiceCommerceCapabilityState = z.infer<
  typeof serviceCommerceCapabilityStateSchema
>
export type ServiceCommerceReadinessState = z.infer<
  typeof serviceCommerceReadinessStateSchema
>
