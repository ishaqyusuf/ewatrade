import { z } from "zod"

export const SERVICE_COMMERCE_PROFILE_STATUSES = [
  "disabled",
  "active",
  "suspended",
] as const

export const SERVICE_COMMERCE_CATALOG_ADOPTION_MODES = [
  "progressive",
  "inventory_managed",
] as const

export const SERVICE_COMMERCE_READINESS_BLOCKERS = [
  "store_inactive",
  "profile_disabled",
  "profile_suspended",
  "capability_disabled",
  "setup_incomplete",
  "policy_restricted",
  "provider_unavailable",
] as const

export const SERVICE_COMMERCE_RECOVERY_ACTIONS = [
  "activate_store",
  "manage_setup",
  "review_policy",
  "retry_provider",
] as const

export const SERVICE_COMMERCE_ACTIVATION_BLOCKERS = [
  "store_inactive",
  "profile_suspended",
  "intake_disabled",
  "channel_missing",
  "channel_unavailable",
  "outcome_missing",
  "outcome_unavailable",
  "progressive_catalog_disabled",
] as const

export const serviceCommerceProfileStatusSchema = z.enum(
  SERVICE_COMMERCE_PROFILE_STATUSES,
)
export const serviceCommerceCatalogAdoptionModeSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_ADOPTION_MODES,
)
export const serviceCommerceReadinessBlockerSchema = z.enum(
  SERVICE_COMMERCE_READINESS_BLOCKERS,
)
export const serviceCommerceRecoveryActionSchema = z.enum(
  SERVICE_COMMERCE_RECOVERY_ACTIONS,
)
export const serviceCommerceActivationBlockerSchema = z.enum(
  SERVICE_COMMERCE_ACTIVATION_BLOCKERS,
)

export const serviceCommerceCapabilityConfigurationSchema = z
  .object({
    booking: z.boolean(),
    delivery: z.boolean(),
    intake: z.boolean(),
    payment: z.boolean(),
    pickup: z.boolean(),
    progressive_catalog: z.boolean(),
    quote: z.boolean(),
    service_completion: z.boolean(),
    staff: z.boolean(),
    web: z.boolean(),
    whatsapp: z.boolean(),
  })
  .strict()

export const serviceCommerceProfileConfigurationSchema = z
  .object({
    capabilities: serviceCommerceCapabilityConfigurationSchema,
    catalogAdoptionMode: serviceCommerceCatalogAdoptionModeSchema,
    procureToOrderEnabled: z.boolean(),
    status: serviceCommerceProfileStatusSchema,
  })
  .strict()

export const serviceCommerceProfileSettingsSchema =
  serviceCommerceProfileConfigurationSchema.omit({ status: true })

export const serviceCommerceOperationalAccessSchema = z
  .object({
    canManage: z.boolean(),
    canOperate: z.boolean(),
    exceptionalAccess: z.boolean(),
  })
  .strict()

export const serviceCommerceChangeReasonSchema = z
  .string()
  .trim()
  .min(3)
  .max(240)

export type ServiceCommerceCatalogAdoptionMode = z.infer<
  typeof serviceCommerceCatalogAdoptionModeSchema
>
export type ServiceCommerceActivationBlocker = z.infer<
  typeof serviceCommerceActivationBlockerSchema
>
export type ServiceCommerceCapabilityConfiguration = z.infer<
  typeof serviceCommerceCapabilityConfigurationSchema
>
export type ServiceCommerceOperationalAccess = z.infer<
  typeof serviceCommerceOperationalAccessSchema
>
export type ServiceCommerceProfileConfiguration = z.infer<
  typeof serviceCommerceProfileConfigurationSchema
>
export type ServiceCommerceProfileSettings = z.infer<
  typeof serviceCommerceProfileSettingsSchema
>
export type ServiceCommerceProfileStatus = z.infer<
  typeof serviceCommerceProfileStatusSchema
>
export type ServiceCommerceReadinessBlocker = z.infer<
  typeof serviceCommerceReadinessBlockerSchema
>
export type ServiceCommerceRecoveryAction = z.infer<
  typeof serviceCommerceRecoveryActionSchema
>
