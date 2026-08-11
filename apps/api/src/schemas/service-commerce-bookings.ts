import {
  serviceCommerceBookingConfigurationSchema,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce/schemas"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const capabilityTokenSchema = z.string().trim().min(20).max(500)
const operationIdSchema = z.string().trim().min(1).max(191)
const storeScopeSchema = { storeId: idSchema.optional() }
const {
  storeId: _serverStoreId,
  tenantId: _serverTenantId,
  ...bookingConfigurationFields
} = serviceCommerceBookingConfigurationSchema.shape

const bookingRelationshipsSchema = z
  .object({
    commercialOrderId: idSchema.optional(),
    quoteVersionId: idSchema.optional(),
    serviceJobId: idSchema.optional(),
  })
  .strict()

// These revisions are derived and persisted by the repository. The dashboard
// receives them for display, but never submits authority to choose them.
const bookingCancellationPolicyCommandSchema = z
  .object({
    allowedUntilMinutesBeforeStart: z.number().int().min(0).max(525_600),
    refundPolicy: z.enum(["none", "full_before_cutoff", "manual_review"]),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict()
  .transform(({ revision: _revision, ...policy }) => policy)
const bookingPaymentPolicyCommandSchema = z
  .object({
    depositMinor: z.number().int().nonnegative().nullable(),
    requirement: z.enum(["none", "deposit", "full"]),
    revision: z.number().int().nonnegative().optional(),
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
  .transform(({ revision: _revision, ...policy }) => policy)

export const serviceCommerceBookingConfigurationReadSchema = z
  .object({ offeringId: idSchema, ...storeScopeSchema })
  .strict()

export const serviceCommerceBookingResourceCreateSchema = z
  .object({
    capacity: z.number().int().min(1).max(10_000),
    clientOperationId: operationIdSchema,
    kind: z.enum(["equipment", "other", "room", "staff"]),
    membershipId: idSchema.optional(),
    name: z.string().trim().min(1).max(191),
    ...storeScopeSchema,
  })
  .strict()

export const serviceCommerceBookingConfigurationUpdateSchema = z
  .object({
    ...bookingConfigurationFields,
    cancellationPolicy: bookingCancellationPolicyCommandSchema,
    clientOperationId: operationIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    paymentPolicy: bookingPaymentPolicyCommandSchema,
    ...storeScopeSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const {
      clientOperationId: _clientOperationId,
      expectedRevision: _expectedRevision,
      storeId: _storeId,
      ...configuration
    } = input
    const result = serviceCommerceBookingConfigurationSchema.safeParse({
      ...configuration,
      cancellationPolicy: {
        ...configuration.cancellationPolicy,
        revision: 0,
      },
      paymentPolicy: { ...configuration.paymentPolicy, revision: 0 },
      storeId: "server-derived-store",
      tenantId: "server-derived-tenant",
    })
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ ...issue, path: issue.path })
      }
    }
  })

export const serviceCommerceBookingCapabilityCreateSchema = z
  .object({
    clientOperationId: operationIdSchema,
    expiresAt: z.coerce.date(),
    offeringId: idSchema,
    source: serviceCommerceSourceRefSchema,
    ...storeScopeSchema,
  })
  .strict()

const holdFields = {
  clientOperationId: operationIdSchema,
  expectedConfigurationRevision: z.number().int().nonnegative(),
  offeringId: idSchema,
  quantity: z.number().int().min(1).max(10_000),
  resourceId: idSchema,
  slotEndAt: z.coerce.date(),
  slotStartAt: z.coerce.date(),
}

export const serviceCommerceStaffBookingHoldSchema = z
  .object({
    ...holdFields,
    source: serviceCommerceSourceRefSchema,
    ...storeScopeSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.slotEndAt <= input.slotStartAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A booking hold slot must end after it starts.",
        path: ["slotEndAt"],
      })
    }
  })

export const serviceCommercePublicBookingSlotsSchema = z
  .object({
    accessToken: capabilityTokenSchema,
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .strict()

export const serviceCommercePublicBookingHoldSchema = z
  .object({ accessToken: capabilityTokenSchema, ...holdFields })
  .strict()
  .superRefine((input, context) => {
    if (input.slotEndAt <= input.slotStartAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A booking hold slot must end after it starts.",
        path: ["slotEndAt"],
      })
    }
  })

const confirmationFields = {
  clientBookingId: operationIdSchema.optional(),
  clientOperationId: operationIdSchema,
  holdId: idSchema,
}

export const serviceCommerceStaffBookingConfirmSchema = z
  .object({
    ...confirmationFields,
    ...bookingRelationshipsSchema.shape,
    source: serviceCommerceSourceRefSchema,
    ...storeScopeSchema,
  })
  .strict()

export const serviceCommercePublicBookingConfirmSchema = z
  .object({
    accessToken: capabilityTokenSchema,
    ...confirmationFields,
    ...bookingRelationshipsSchema.shape,
  })
  .strict()

const revisionBase = {
  bookingId: idSchema,
  clientOperationId: operationIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  operation: z.enum([
    "arrive",
    "cancel",
    "complete",
    "mark_no_show",
    "reschedule",
    "start",
  ]),
  reasonCode: z.string().trim().min(1).max(80).optional(),
  resourceId: idSchema.optional(),
  newSlotEndAt: z.coerce.date().optional(),
  newSlotStartAt: z.coerce.date().optional(),
}

function validateRevision(
  input: {
    newSlotEndAt?: Date
    newSlotStartAt?: Date
    operation: string
    reasonCode?: string
    resourceId?: string
  },
  context: z.RefinementCtx,
) {
  const requiresReason = ["cancel", "mark_no_show", "reschedule"].includes(
    input.operation,
  )
  if (requiresReason && !input.reasonCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "This booking operation requires a structured reason code.",
      path: ["reasonCode"],
    })
  }
  if (input.operation === "reschedule") {
    if (!input.resourceId || !input.newSlotStartAt || !input.newSlotEndAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rescheduling requires a resource and a complete slot.",
        path: ["resourceId"],
      })
    } else if (input.newSlotEndAt <= input.newSlotStartAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A rescheduled slot must end after it starts.",
        path: ["newSlotEndAt"],
      })
    }
  }
}

export const serviceCommerceStaffBookingReviseSchema = z
  .object({ ...storeScopeSchema, ...revisionBase })
  .strict()
  .superRefine(validateRevision)

export const serviceCommercePublicBookingReviseSchema = z
  .object({
    accessToken: capabilityTokenSchema,
    ...revisionBase,
    operation: z.enum(["cancel", "reschedule"]),
  })
  .strict()
  .superRefine(validateRevision)

export const serviceCommercePublicBookingDetailSchema = z
  .object({ accessToken: capabilityTokenSchema })
  .strict()
