import { z } from "zod"

import { serviceCommerceSourceRefSchema } from "./source"

const idSchema = z.string().trim().min(1).max(191)
const positiveIntegerSchema = z.number().int().positive()
const nonnegativeIntegerSchema = z.number().int().nonnegative()
const reasonCodeSchema = z.string().trim().min(1).max(80)
const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/**
 * Customer manage links are revocable, but deliberately short-lived. Keeping
 * the booking horizon within the same window ensures a confirmed customer can
 * still use its manage link for any slot the business is willing to offer.
 */
export const SERVICE_COMMERCE_BOOKING_MANAGE_CAPABILITY_MAX_MINUTES =
  60 * 24 * 30

function isIanaTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const SERVICE_COMMERCE_BOOKING_STATUSES = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_service",
  "completed",
  "cancelled",
  "no_show",
] as const

export const SERVICE_COMMERCE_BOOKING_HOLD_STATUSES = [
  "active",
  "confirmed",
  "expired",
  "released",
] as const

export const SERVICE_COMMERCE_BOOKING_PAYMENT_REQUIREMENTS = [
  "none",
  "deposit",
  "full",
] as const

export const SERVICE_COMMERCE_BOOKING_REFUND_POLICIES = [
  "none",
  "full_before_cutoff",
  "manual_review",
] as const

export const SERVICE_COMMERCE_BOOKING_NOTIFICATION_KINDS = [
  "booking_confirmation",
  "booking_reminder",
  "booking_change",
  "booking_cancellation",
] as const

export const SERVICE_COMMERCE_BOOKING_CAPABILITY_PURPOSES = [
  "view_slots",
  "confirm",
  "view_and_manage",
] as const

export const SERVICE_COMMERCE_BOOKING_REFUND_OUTCOMES = [
  "none",
  "refund_eligible",
  "manual_review",
] as const

export const serviceCommerceBookingStatusSchema = z.enum(
  SERVICE_COMMERCE_BOOKING_STATUSES,
)
export const serviceCommerceBookingHoldStatusSchema = z.enum(
  SERVICE_COMMERCE_BOOKING_HOLD_STATUSES,
)
export const serviceCommerceBookingPaymentRequirementSchema = z.enum(
  SERVICE_COMMERCE_BOOKING_PAYMENT_REQUIREMENTS,
)
export const serviceCommerceBookingRefundPolicySchema = z.enum(
  SERVICE_COMMERCE_BOOKING_REFUND_POLICIES,
)
export const serviceCommerceBookingNotificationKindSchema = z.enum(
  SERVICE_COMMERCE_BOOKING_NOTIFICATION_KINDS,
)
export const serviceCommerceBookingCapabilityPurposeSchema = z.enum(
  SERVICE_COMMERCE_BOOKING_CAPABILITY_PURPOSES,
)
export const serviceCommerceBookingRefundOutcomeSchema = z.enum(
  SERVICE_COMMERCE_BOOKING_REFUND_OUTCOMES,
)

export const serviceCommerceBookingConfigurationScopeSchema = z
  .object({
    storeId: idSchema,
    tenantId: idSchema,
  })
  .strict()

export const serviceCommerceBookingScopeSchema = z
  .object({
    source: serviceCommerceSourceRefSchema,
    storeId: idSchema,
    tenantId: idSchema,
  })
  .strict()

/**
 * Booking keeps only opaque links to the existing request-to-service graph.
 * It never becomes a replacement Order, payment, or vertical-specific state.
 */
export const serviceCommerceBookingRelationshipsSchema = z
  .object({
    orderId: idSchema.optional(),
    quoteVersionId: idSchema.optional(),
    serviceJobId: idSchema.optional(),
  })
  .strict()

export const serviceCommerceBookingResourceSchema = z
  .object({
    capacity: positiveIntegerSchema.max(10_000),
    id: idSchema,
    label: z.string().trim().min(1).max(191),
  })
  .strict()

export const serviceCommerceBookingAvailabilityRuleSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    endLocalTime: localTimeSchema,
    id: idSchema,
    startLocalTime: localTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.daysOfWeek).size !== value.daysOfWeek.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Availability weekdays must not repeat.",
        path: ["daysOfWeek"],
      })
    }
    if (value.startLocalTime >= value.endLocalTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Availability must end after it starts on the same local day.",
        path: ["endLocalTime"],
      })
    }
  })

const bookingExceptionTimingSchema = z
  .object({
    endAt: z.coerce.date(),
    id: idSchema,
    startAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endAt <= value.startAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Availability exceptions must end after they start.",
        path: ["endAt"],
      })
    }
  })

export const serviceCommerceBookingAvailabilityExceptionSchema =
  z.discriminatedUnion("kind", [
    bookingExceptionTimingSchema.extend({ kind: z.literal("closed") }).strict(),
    bookingExceptionTimingSchema.extend({ kind: z.literal("open") }).strict(),
    bookingExceptionTimingSchema
      .extend({
        capacity: positiveIntegerSchema.max(10_000),
        kind: z.literal("capacity_override"),
      })
      .strict(),
  ])

export const serviceCommerceBookingPaymentPolicySchema = z
  .object({
    depositMinor: nonnegativeIntegerSchema.nullable(),
    requirement: serviceCommerceBookingPaymentRequirementSchema,
    revision: nonnegativeIntegerSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requirement === "deposit" && !value.depositMinor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deposit payment policy requires a positive deposit amount.",
        path: ["depositMinor"],
      })
    }
    if (value.requirement !== "deposit" && value.depositMinor !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only a deposit policy can carry a deposit amount.",
        path: ["depositMinor"],
      })
    }
  })

export const serviceCommerceBookingCancellationPolicySchema = z
  .object({
    allowedUntilMinutesBeforeStart: nonnegativeIntegerSchema.max(525_600),
    refundPolicy: serviceCommerceBookingRefundPolicySchema,
    revision: nonnegativeIntegerSchema,
  })
  .strict()

const serviceCommerceBookingConfigurationObjectSchema =
  serviceCommerceBookingConfigurationScopeSchema
    .extend({
      availabilityRules: z.array(serviceCommerceBookingAvailabilityRuleSchema),
      exceptions: z.array(serviceCommerceBookingAvailabilityExceptionSchema),
      bookingHorizonMinutes: positiveIntegerSchema.max(
        SERVICE_COMMERCE_BOOKING_MANAGE_CAPABILITY_MAX_MINUTES,
      ),
      cancellationPolicy: serviceCommerceBookingCancellationPolicySchema,
      holdDurationMinutes: positiveIntegerSchema.max(1_440),
      leadTimeMinutes: nonnegativeIntegerSchema.max(525_600),
      offeringId: idSchema,
      paymentPolicy: serviceCommerceBookingPaymentPolicySchema,
      reminderLeadMinutes: nonnegativeIntegerSchema.max(525_600),
      resources: z.array(serviceCommerceBookingResourceSchema).min(1).max(500),
      slotDurationMinutes: positiveIntegerSchema.max(43_200),
      timezone: z
        .string()
        .trim()
        .min(1)
        .max(191)
        .refine(isIanaTimeZone, "A valid IANA Store timezone is required."),
    })
    .strict()

function validateServiceCommerceBookingConfiguration(
  value: Pick<
    z.infer<typeof serviceCommerceBookingConfigurationObjectSchema>,
    "bookingHorizonMinutes" | "holdDurationMinutes" | "resources"
  >,
  context: z.RefinementCtx,
) {
  const resourceIds = value.resources.map((resource) => resource.id)
  if (new Set(resourceIds).size !== resourceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Booking resources must be unique within a Store offering.",
      path: ["resources"],
    })
  }
  if (value.holdDurationMinutes > value.bookingHorizonMinutes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hold duration cannot exceed the booking horizon.",
      path: ["holdDurationMinutes"],
    })
  }
}

export const serviceCommerceBookingConfigurationSchema =
  serviceCommerceBookingConfigurationObjectSchema.superRefine(
    validateServiceCommerceBookingConfiguration,
  )

export const serviceCommerceBookingConfigurationFormSchema =
  serviceCommerceBookingConfigurationObjectSchema
    .omit({ storeId: true, tenantId: true })
    .superRefine(validateServiceCommerceBookingConfiguration)

export const serviceCommerceBookingPaymentPolicySnapshotSchema = z
  .object({
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    depositMinor: nonnegativeIntegerSchema.nullable(),
    payableAmountMinor: nonnegativeIntegerSchema,
    requirement: serviceCommerceBookingPaymentRequirementSchema,
    requiredPaymentMinor: nonnegativeIntegerSchema,
    revision: nonnegativeIntegerSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requirement === "none") {
      if (value.depositMinor !== null || value.requiredPaymentMinor !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "No-payment bookings cannot require a deposit or payment.",
          path: ["requiredPaymentMinor"],
        })
      }
    }
    if (value.requirement === "deposit" && !value.depositMinor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deposit payment policy requires an exact deposit amount.",
        path: ["depositMinor"],
      })
    }
    if (
      value.requirement === "deposit" &&
      (value.depositMinor === null ||
        value.depositMinor > value.payableAmountMinor ||
        value.requiredPaymentMinor !== value.depositMinor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deposit payment must be positive, payable, and exact.",
        path: ["requiredPaymentMinor"],
      })
    }
    if (
      value.requirement === "full" &&
      (value.depositMinor !== null ||
        value.requiredPaymentMinor !== value.payableAmountMinor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Full payment bookings require the exact payable amount.",
        path: ["requiredPaymentMinor"],
      })
    }
    if (value.requirement !== "deposit" && value.depositMinor !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only a deposit policy can carry a deposit amount.",
        path: ["depositMinor"],
      })
    }
  })

export const serviceCommerceBookingCancellationPolicySnapshotSchema =
  serviceCommerceBookingCancellationPolicySchema

export const serviceCommerceBookingPolicySnapshotSchema = z
  .object({
    cancellation: serviceCommerceBookingCancellationPolicySnapshotSchema,
    payment: serviceCommerceBookingPaymentPolicySnapshotSchema,
  })
  .strict()

export const serviceCommerceBookingHoldSchema =
  serviceCommerceBookingScopeSchema
    .extend({
      bookingPolicyRevision: nonnegativeIntegerSchema,
      clientOperationId: idSchema,
      expiresAt: z.coerce.date(),
      holdId: idSchema,
      quantity: positiveIntegerSchema.max(10_000),
      resourceId: idSchema,
      slotEndAt: z.coerce.date(),
      slotStartAt: z.coerce.date(),
      status: serviceCommerceBookingHoldStatusSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.expiresAt >= value.slotStartAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A booking hold must expire before its slot begins.",
          path: ["expiresAt"],
        })
      }
      if (value.slotEndAt <= value.slotStartAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A booking hold must end after it starts.",
          path: ["slotEndAt"],
        })
      }
    })

export const serviceCommerceBookingHoldCommandSchema =
  serviceCommerceBookingScopeSchema
    .extend({
      clientOperationId: idSchema,
      expectedConfigurationRevision: nonnegativeIntegerSchema,
      operation: z.literal("hold_slot"),
      quantity: positiveIntegerSchema.max(10_000),
      resourceId: idSchema,
      slotEndAt: z.coerce.date(),
      slotStartAt: z.coerce.date(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.slotEndAt <= value.slotStartAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A booking hold slot must end after it starts.",
          path: ["slotEndAt"],
        })
      }
    })

const bookingCommandBaseSchema = serviceCommerceBookingScopeSchema
  .extend({
    bookingId: idSchema,
    clientOperationId: idSchema,
    expectedRevision: nonnegativeIntegerSchema,
    resourceId: idSchema,
  })
  .merge(serviceCommerceBookingRelationshipsSchema)

export const serviceCommerceBookingCommandSchema = z.discriminatedUnion(
  "operation",
  [
    bookingCommandBaseSchema
      .extend({
        holdId: idSchema,
        operation: z.literal("confirm"),
        policySnapshot: serviceCommerceBookingPolicySnapshotSchema,
      })
      .strict(),
    bookingCommandBaseSchema
      .extend({
        operation: z.literal("reschedule"),
        newSlotEndAt: z.coerce.date(),
        newSlotStartAt: z.coerce.date(),
        reasonCode: reasonCodeSchema,
      })
      .strict()
      .superRefine((value, context) => {
        if (value.newSlotEndAt <= value.newSlotStartAt) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A rescheduled slot must end after it starts.",
            path: ["newSlotEndAt"],
          })
        }
      }),
    bookingCommandBaseSchema
      .extend({ operation: z.literal("cancel"), reasonCode: reasonCodeSchema })
      .strict(),
    bookingCommandBaseSchema
      .extend({ operation: z.literal("arrive") })
      .strict(),
    bookingCommandBaseSchema.extend({ operation: z.literal("start") }).strict(),
    bookingCommandBaseSchema
      .extend({ operation: z.literal("complete") })
      .strict(),
    bookingCommandBaseSchema
      .extend({
        operation: z.literal("mark_no_show"),
        reasonCode: reasonCodeSchema,
      })
      .strict(),
  ],
)

export const serviceCommerceBookingNotificationIntentSchema = z
  .object({
    bookingId: idSchema,
    kind: serviceCommerceBookingNotificationKindSchema,
    scheduledEndAt: z.coerce.date(),
    scheduledStartAt: z.coerce.date(),
    stateRevision: nonnegativeIntegerSchema,
    storeId: idSchema,
    tenantId: idSchema,
  })
  .strict()

export const serviceCommerceCustomerBookingCapabilitySchema = z
  .object({
    bookingId: idSchema.optional(),
    expiresAt: z.coerce.date(),
    offeringId: idSchema,
    purpose: serviceCommerceBookingCapabilityPurposeSchema,
    revokedAt: z.coerce.date().nullable(),
    source: serviceCommerceSourceRefSchema,
    stateRevision: nonnegativeIntegerSchema,
    tokenId: idSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.purpose === "view_and_manage" && !value.bookingId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Booking management capabilities require a booking identity.",
        path: ["bookingId"],
      })
    }
  })

export const serviceCommerceBookingCancellationConsequenceSchema = z
  .object({
    bookingId: idSchema,
    cancellationAllowed: z.boolean(),
    refundAmountMinor: nonnegativeIntegerSchema.nullable(),
    refundOutcome: serviceCommerceBookingRefundOutcomeSchema,
    stateRevision: nonnegativeIntegerSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.cancellationAllowed && value.refundOutcome !== "none") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A disallowed cancellation cannot produce a refund outcome.",
        path: ["refundOutcome"],
      })
    }
    if (
      value.refundOutcome === "refund_eligible" &&
      value.refundAmountMinor === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An eligible refund requires an exact amount.",
        path: ["refundAmountMinor"],
      })
    }
    if (
      value.refundOutcome !== "refund_eligible" &&
      value.refundAmountMinor !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only an eligible refund can expose an amount.",
        path: ["refundAmountMinor"],
      })
    }
  })

export type ServiceCommerceBookingAvailabilityException = z.infer<
  typeof serviceCommerceBookingAvailabilityExceptionSchema
>
export type ServiceCommerceBookingAvailabilityRule = z.infer<
  typeof serviceCommerceBookingAvailabilityRuleSchema
>
export type ServiceCommerceBookingCommand = z.infer<
  typeof serviceCommerceBookingCommandSchema
>
export type ServiceCommerceBookingConfiguration = z.infer<
  typeof serviceCommerceBookingConfigurationSchema
>
export type ServiceCommerceBookingCancellationConsequence = z.infer<
  typeof serviceCommerceBookingCancellationConsequenceSchema
>
export type ServiceCommerceBookingConfigurationScope = z.infer<
  typeof serviceCommerceBookingConfigurationScopeSchema
>
export type ServiceCommerceBookingCustomerCapability = z.infer<
  typeof serviceCommerceCustomerBookingCapabilitySchema
>
export type ServiceCommerceBookingHold = z.infer<
  typeof serviceCommerceBookingHoldSchema
>
export type ServiceCommerceBookingHoldCommand = z.infer<
  typeof serviceCommerceBookingHoldCommandSchema
>
export type ServiceCommerceBookingRelationships = z.infer<
  typeof serviceCommerceBookingRelationshipsSchema
>
export type ServiceCommerceBookingNotificationIntent = z.infer<
  typeof serviceCommerceBookingNotificationIntentSchema
>
export type ServiceCommerceBookingStatus = z.infer<
  typeof serviceCommerceBookingStatusSchema
>
