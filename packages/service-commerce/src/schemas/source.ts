import { z } from "zod"

export const SERVICE_COMMERCE_SOURCE_KINDS = [
  "service",
  "prescription",
  "commerce_inquiry",
] as const

export const SERVICE_COMMERCE_CHANNEL_ORIGINS = [
  "web",
  "staff",
  "whatsapp",
] as const

export const serviceCommerceSourceKindSchema = z.enum(
  SERVICE_COMMERCE_SOURCE_KINDS,
)
export const serviceCommerceChannelOriginSchema = z.enum(
  SERVICE_COMMERCE_CHANNEL_ORIGINS,
)
export const serviceCommerceSourceRefSchema = z
  .object({
    id: z.string().trim().min(1).max(191),
    kind: serviceCommerceSourceKindSchema,
  })
  .strict()

export type ServiceCommerceChannelOrigin = z.infer<
  typeof serviceCommerceChannelOriginSchema
>
export type ServiceCommerceSourceKind = z.infer<
  typeof serviceCommerceSourceKindSchema
>
export type ServiceCommerceSourceRef = z.infer<
  typeof serviceCommerceSourceRefSchema
>
