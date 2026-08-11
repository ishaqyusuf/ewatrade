import { z } from "zod"

import { serviceCommerceReadinessStateSchema } from "./capability"

export const SERVICE_COMMERCE_CHANNEL_CONNECTION_LIFECYCLES = [
  "pending",
  "active",
  "suspended",
  "revoked",
  "replaced",
] as const

export const SERVICE_COMMERCE_CHANNEL_CONNECTION_READINESS = [
  "setup_required",
  "configuration_required",
  "test_required",
  "ready",
  "blocked",
] as const

export const SERVICE_COMMERCE_STORE_ATTENDANT_ASSIGNMENT_STATUSES = [
  "active",
  "suspended",
  "removed",
] as const

export const SERVICE_COMMERCE_ENTRY_POINT_STATUSES = [
  "unpublished",
  "published",
  "revoked",
] as const

export const SERVICE_COMMERCE_ENTRY_POINT_ACTIONS = [
  "copy_link",
  "download_qr",
] as const

export const SERVICE_COMMERCE_PUBLIC_ENTRY_ACTIONS = [
  "request_online",
  "chat_on_whatsapp",
] as const

export const SERVICE_COMMERCE_ENTRY_POINT_PUBLISH_BLOCKERS = [
  "active_attendant_missing",
  "allowed_channel_missing",
] as const

export const SERVICE_COMMERCE_CHANNEL_RECOMMENDATION_REASONS = [
  "onboarding_whatsapp",
  "category_conversational_sales",
  "multi_store_team",
  "pharmacy_policy_review",
] as const

export const SERVICE_COMMERCE_CHANNEL_RECOMMENDATION_SETUP_STEPS = [
  "connect_whatsapp",
  "assign_attendants",
  "configure_store_routing",
  "review_vertical_policy",
  "publish_entry_point",
] as const

const serviceCommerceOpaqueIdSchema = z.string().trim().min(1).max(200)

export const serviceCommerceManualWhatsAppConnectionSchema = z
  .object({
    accessToken: z.string().trim().min(20).max(2_000),
    billingOwner: z.string().trim().max(160).optional(),
    businessDisplayName: z.string().trim().max(160).optional(),
    displayNumber: z.string().trim().min(7).max(40),
    phoneNumberId: serviceCommerceOpaqueIdSchema,
    testRecipient: z.string().trim().min(7).max(40),
    wabaId: serviceCommerceOpaqueIdSchema,
  })
  .strict()

export const serviceCommerceStoreBindingConfigurationSchema = z
  .object({
    connectionId: serviceCommerceOpaqueIdSchema,
    storeIds: z.array(serviceCommerceOpaqueIdSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.storeIds).size !== input.storeIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Store assignments must be unique.",
        path: ["storeIds"],
      })
    }
  })

export const serviceCommerceChannelConnectionLifecycleSchema = z.enum(
  SERVICE_COMMERCE_CHANNEL_CONNECTION_LIFECYCLES,
)
export const serviceCommerceChannelConnectionReadinessSchema = z.enum(
  SERVICE_COMMERCE_CHANNEL_CONNECTION_READINESS,
)
export const serviceCommerceChannelConnectionStoreAssignmentSchema = z
  .object({
    id: serviceCommerceOpaqueIdSchema,
    name: z.string().trim().min(1).max(200),
  })
  .strict()
export const serviceCommerceChannelConnectionProjectionSchema = z
  .object({
    id: serviceCommerceOpaqueIdSchema,
    lifecycle: serviceCommerceChannelConnectionLifecycleSchema,
    provider: z.literal("whatsapp"),
    readiness: serviceCommerceChannelConnectionReadinessSchema,
    storeAssignments: z.array(
      serviceCommerceChannelConnectionStoreAssignmentSchema,
    ),
  })
  .strict()

export const serviceCommerceStoreAttendantAssignmentInputSchema = z
  .object({ membershipId: serviceCommerceOpaqueIdSchema })
  .strict()
export const serviceCommerceStoreAttendantAssignmentStatusSchema = z
  .object({
    membershipId: serviceCommerceOpaqueIdSchema,
    status: z.enum(SERVICE_COMMERCE_STORE_ATTENDANT_ASSIGNMENT_STATUSES),
  })
  .strict()

export const serviceCommerceEntryPointChannelSchema = z
  .object({
    channel: z.enum(["web", "whatsapp"]),
    readiness: serviceCommerceReadinessStateSchema,
  })
  .strict()
export const serviceCommerceEntryPointStatusSchema = z.enum(
  SERVICE_COMMERCE_ENTRY_POINT_STATUSES,
)
export const serviceCommerceEntryPointActionSchema = z.enum(
  SERVICE_COMMERCE_ENTRY_POINT_ACTIONS,
)
export const serviceCommercePublicEntryActionSchema = z.enum(
  SERVICE_COMMERCE_PUBLIC_ENTRY_ACTIONS,
)
export const serviceCommerceEntryPointPublishBlockerSchema = z.enum(
  SERVICE_COMMERCE_ENTRY_POINT_PUBLISH_BLOCKERS,
)
export const serviceCommerceEntryPointSchema = z
  .object({
    entryToken: serviceCommerceOpaqueIdSchema,
    id: serviceCommerceOpaqueIdSchema,
    status: serviceCommerceEntryPointStatusSchema,
  })
  .strict()
export const serviceCommerceEntryPointProjectionSchema =
  serviceCommerceEntryPointSchema
    .extend({
      actions: z.array(serviceCommerceEntryPointActionSchema),
      publishBlockers: z.array(serviceCommerceEntryPointPublishBlockerSchema),
    })
    .strict()

export const serviceCommerceChannelRecommendationInputSchema = z
  .object({
    businessProfileKey: z.string().trim().min(1).max(160).nullable(),
    operatingModel: z
      .enum(["products", "services", "products_and_services"])
      .nullable(),
    orderChannels: z.array(
      z.enum([
        "walk_in",
        "phone_whatsapp",
        "delivery_pickup",
        "online",
        "sales_representatives",
      ]),
    ),
    storeCount: z.number().int().min(1),
    teamSize: z.enum(["solo", "2_5", "6_10", "11_plus"]).nullable(),
  })
  .strict()

export const serviceCommerceChannelRecommendationSchema = z
  .object({
    advisoryOnly: z.literal(true),
    attendantMode: z.enum(["owner_attendant", "team_attendants"]),
    authorizationEffect: z.literal("none"),
    connectionMode: z.enum(["store_specific", "central_with_branch_choice"]),
    policyReviewRequired: z.boolean(),
    reasons: z.array(z.enum(SERVICE_COMMERCE_CHANNEL_RECOMMENDATION_REASONS)),
    recommendedChannels: z.array(z.enum(["web", "whatsapp"])),
    setupSteps: z.array(
      z.enum(SERVICE_COMMERCE_CHANNEL_RECOMMENDATION_SETUP_STEPS),
    ),
  })
  .strict()

export type ServiceCommerceChannelConnectionLifecycle = z.infer<
  typeof serviceCommerceChannelConnectionLifecycleSchema
>
export type ServiceCommerceManualWhatsAppConnection = z.infer<
  typeof serviceCommerceManualWhatsAppConnectionSchema
>
export type ServiceCommerceStoreBindingConfiguration = z.infer<
  typeof serviceCommerceStoreBindingConfigurationSchema
>
export type ServiceCommerceChannelConnectionProjection = z.infer<
  typeof serviceCommerceChannelConnectionProjectionSchema
>
export type ServiceCommerceChannelConnectionReadiness = z.infer<
  typeof serviceCommerceChannelConnectionReadinessSchema
>
export type ServiceCommerceEntryPoint = z.infer<
  typeof serviceCommerceEntryPointSchema
>
export type ServiceCommerceEntryPointAction = z.infer<
  typeof serviceCommerceEntryPointActionSchema
>
export type ServiceCommercePublicEntryAction = z.infer<
  typeof serviceCommercePublicEntryActionSchema
>
export type ServiceCommerceEntryPointChannel = z.infer<
  typeof serviceCommerceEntryPointChannelSchema
>
export type ServiceCommerceEntryPointProjection = z.infer<
  typeof serviceCommerceEntryPointProjectionSchema
>
export type ServiceCommerceEntryPointPublishBlocker = z.infer<
  typeof serviceCommerceEntryPointPublishBlockerSchema
>
export type ServiceCommerceEntryPointStatus = z.infer<
  typeof serviceCommerceEntryPointStatusSchema
>
export type ServiceCommerceStoreAttendantAssignmentInput = z.infer<
  typeof serviceCommerceStoreAttendantAssignmentInputSchema
>
export type ServiceCommerceStoreAttendantAssignmentStatus = z.infer<
  typeof serviceCommerceStoreAttendantAssignmentStatusSchema
>
export type ServiceCommerceChannelRecommendationInput = z.infer<
  typeof serviceCommerceChannelRecommendationInputSchema
>
export type ServiceCommerceChannelRecommendation = z.infer<
  typeof serviceCommerceChannelRecommendationSchema
>
