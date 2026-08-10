import { z } from "zod"

import { serviceCommerceProductDemandSchema } from "./request"
import {
  serviceCommerceChannelOriginSchema,
  serviceCommerceSourceRefSchema,
} from "./source"

const idSchema = z.string().trim().min(1).max(191)
const optionalContactSchema = z.string().trim().min(1).max(320).optional()

export const serviceCommerceIntakeConsentSchema = z
  .object({
    contactOptIn: z.boolean().default(false),
    privacyNoticeVersion: z.string().trim().min(1).max(80),
  })
  .strict()

export const serviceCommerceIntakeContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entry_point"), token: idSchema }).strict(),
  z.object({ kind: z.literal("store"), storeId: idSchema }).strict(),
  z
    .object({ inboundEventId: idSchema, kind: z.literal("inbound_event") })
    .strict(),
])

const customerSchema = z
  .object({
    email: optionalContactSchema,
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(7).max(40).optional(),
  })
  .strict()

const serviceLineSchema = z
  .object({
    details: z.string().trim().max(2_000).optional(),
    offeringId: idSchema,
    quantity: z.string().trim().min(1).max(80),
  })
  .strict()

const inquiryLineSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    requestedQuantity: z.string().trim().min(1).max(80).optional(),
  })
  .strict()

export const serviceCommerceIntakeIntentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      customer: customerSchema,
      demand: serviceCommerceProductDemandSchema,
      kind: z.literal("commerce_inquiry"),
      lines: z.array(inquiryLineSchema).min(1).max(100),
      summary: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      customer: customerSchema,
      details: z.string().trim().max(8_000).optional(),
      formToken: idSchema,
      kind: z.literal("service"),
      lines: z.array(serviceLineSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      customer: customerSchema,
      fulfilmentPreference: z.enum(["delivery", "pickup", "unspecified"]),
      kind: z.literal("prescription"),
      manualIntakeText: z.string().trim().min(1).max(8_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("exact_product"),
      offeringId: idSchema,
      quantity: z.string().trim().min(1).max(80),
    })
    .strict(),
])

export const serviceCommerceIntakeEnvelopeSchema = z
  .object({
    channel: serviceCommerceChannelOriginSchema,
    clientCommandId: idSchema,
    consent: serviceCommerceIntakeConsentSchema,
    context: serviceCommerceIntakeContextSchema,
    intent: serviceCommerceIntakeIntentSchema,
    providerEventId: idSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.channel === "web" && value.context.kind !== "entry_point") {
      ctx.addIssue({
        code: "custom",
        message: "Web intake requires an entry-point context.",
        path: ["context"],
      })
    }
    if (value.channel === "staff" && value.context.kind !== "store") {
      ctx.addIssue({
        code: "custom",
        message: "Staff intake requires a Store context.",
        path: ["context"],
      })
    }
    if (
      value.channel === "whatsapp" &&
      (value.context.kind !== "inbound_event" || !value.providerEventId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "WhatsApp intake requires provider event context.",
        path: ["context"],
      })
    }
  })

export const serviceCommerceIntakeAcceptedSchema = z
  .object({
    channel: serviceCommerceChannelOriginSchema,
    replayed: z.boolean(),
    source: serviceCommerceSourceRefSchema,
    status: z.literal("accepted"),
  })
  .strict()

export const serviceCommerceIntakeRecoverySchema = z
  .object({
    action: z.enum([
      "choose_intent",
      "contact_business",
      "retry",
      "use_cart",
      "use_current_entry",
    ]),
    code: z.enum([
      "ambiguous",
      "disabled",
      "stale_context",
      "temporary_failure",
      "unsupported",
    ]),
    status: z.literal("recovery"),
  })
  .strict()

export type ServiceCommerceIntakeEnvelope = z.infer<
  typeof serviceCommerceIntakeEnvelopeSchema
>
export type ServiceCommerceIntakeIntent = z.infer<
  typeof serviceCommerceIntakeIntentSchema
>
export type ServiceCommerceIntakeAccepted = z.infer<
  typeof serviceCommerceIntakeAcceptedSchema
>
export type ServiceCommerceIntakeRecovery = z.infer<
  typeof serviceCommerceIntakeRecoverySchema
>
