import { z } from "zod"
import { serviceCommerceSourceKindSchema } from "./source"

export const SERVICE_COMMERCE_ACTIONS = [
  "request_quote",
  "view_quote",
  "choose_quote_option",
  "book",
  "pay_now",
  "pick_up",
  "delivery",
  "talk_to_staff",
  "reschedule",
  "cancel",
] as const

export const serviceCommerceActionSchema = z.enum(SERVICE_COMMERCE_ACTIONS)

export const SERVICE_COMMERCE_ACTION_CONFIRMATIONS = [
  "none",
  "required",
] as const

export const serviceCommerceActionConfirmationSchema = z.enum(
  SERVICE_COMMERCE_ACTION_CONFIRMATIONS,
)

export const serviceCommerceCustomerActionCandidateSchema = z
  .object({
    action: serviceCommerceActionSchema,
    amountMinor: z.number().int().nonnegative().optional(),
    confirmation: serviceCommerceActionConfirmationSchema,
    consequence: z.string().trim().min(1).max(240),
    currencyCode: z.string().trim().length(3).optional(),
    label: z.string().trim().min(1).max(120),
    targetKey: z.string().trim().min(1).max(191).optional(),
  })
  .strict()

export const serviceCommerceCustomerActionProjectionSchema =
  serviceCommerceCustomerActionCandidateSchema
    .omit({ targetKey: true })
    .extend({
      capabilityToken: z.string().trim().min(20).max(500),
      expiresAt: z.coerce.date(),
    })
    .strict()

export const SERVICE_COMMERCE_CUSTOMER_ACTION_RESULT_KINDS = [
  "booking",
  "checkout",
  "delivery",
  "pickup",
  "quote",
  "quote_option_selected",
  "request_recorded",
  "support",
] as const

export const serviceCommerceCustomerActionResultKindSchema = z.enum(
  SERVICE_COMMERCE_CUSTOMER_ACTION_RESULT_KINDS,
)

export const serviceCommerceCustomerActionPreviewSchema = z.discriminatedUnion(
  "available",
  [
    z
      .object({
        action: serviceCommerceActionSchema,
        amountMinor: z.number().int().nonnegative().nullable(),
        available: z.literal(true),
        confirmation: serviceCommerceActionConfirmationSchema,
        consequence: z.string().trim().min(1).max(240),
        currencyCode: z.string().trim().length(3).nullable(),
        expiresAt: z.coerce.date(),
        label: z.string().trim().min(1).max(120),
      })
      .strict(),
    z
      .object({
        available: z.literal(false),
        recovery: z.enum(["refresh", "talk_to_staff"]),
        supportToken: z.string().trim().min(20).max(500).nullable(),
      })
      .strict(),
  ],
)

export const serviceCommerceCustomerActionExecutionResultSchema = z
  .object({
    checkoutUrl: z.string().url().max(2048).optional(),
    kind: serviceCommerceCustomerActionResultKindSchema,
    replayed: z.boolean(),
    sourceKind: serviceCommerceSourceKindSchema,
  })
  .strict()

export type ServiceCommerceAction = z.infer<typeof serviceCommerceActionSchema>
export type ServiceCommerceActionConfirmation = z.infer<
  typeof serviceCommerceActionConfirmationSchema
>
export type ServiceCommerceCustomerActionCandidate = z.infer<
  typeof serviceCommerceCustomerActionCandidateSchema
>
export type ServiceCommerceCustomerActionProjection = z.infer<
  typeof serviceCommerceCustomerActionProjectionSchema
>
export type ServiceCommerceCustomerActionPreview = z.infer<
  typeof serviceCommerceCustomerActionPreviewSchema
>
export type ServiceCommerceCustomerActionExecutionResult = z.infer<
  typeof serviceCommerceCustomerActionExecutionResultSchema
>
