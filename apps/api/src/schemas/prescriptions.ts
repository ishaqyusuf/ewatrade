import {
  prescriptionRoleAssignmentFields,
  prescriptionStaffIntakeFields,
  prescriptionStoreSettingsFields,
} from "@ewatrade/prescriptions/schemas"
import { z } from "zod"

const storeIdSchema = z.string().trim().min(1)

export const prescriptionStoreSetupSchema = z
  .object({ storeId: storeIdSchema.optional() })
  .strict()

export const prescriptionSelectableOfferingsSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export const prescriptionStoreSettingsUpdateSchema = z
  .object({
    ...prescriptionStoreSettingsFields,
    storeId: storeIdSchema,
  })
  .strict()
  .refine((value) => value.pickupEnabled || value.deliveryEnabled, {
    message: "Enable pickup, delivery, or both.",
    path: ["pickupEnabled"],
  })

export const prescriptionRoleAssignmentSchema = z
  .object({
    ...prescriptionRoleAssignmentFields,
    storeId: storeIdSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.role !== "pharmacist") return
    if (!value.credentialReference) {
      ctx.addIssue({
        code: "custom",
        message: "A pharmacist credential reference is required.",
        path: ["credentialReference"],
      })
    }
    if (!value.credentialVerified) {
      ctx.addIssue({
        code: "custom",
        message: "The pharmacist credential must be verified.",
        path: ["credentialVerified"],
      })
    }
  })

export const prescriptionRoleRevokeSchema = z
  .object({
    roleId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionActivationSchema = z
  .object({ active: z.boolean(), storeId: storeIdSchema })
  .strict()

const prescriptionSourceSchema = z.enum([
  "staff_phone",
  "staff_walk_in",
  "web",
  "whatsapp",
])

const prescriptionRequestStatusSchema = z.enum([
  "attendant_verification",
  "converted",
  "declined",
  "expired",
  "media_review",
  "needs_clarification",
  "needs_clearer_media",
  "pharmacist_review",
  "quoted",
  "ready_to_quote",
  "received",
  "transcribing",
  "withdrawn",
])

const fulfilmentPreferenceSchema = z.enum(["delivery", "pickup", "unspecified"])

export const prescriptionMediaManifestSchema = z
  .object({
    clientMediaId: z.string().trim().min(1).max(120),
    mediaType: z.enum([
      "application/pdf",
      "image/heic",
      "image/heif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    objectKey: z.string().trim().min(1).max(600),
    originalFileName: z.string().trim().min(1).max(255),
    pageNumber: z.number().int().min(1).max(12),
    sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    sizeBytes: z.number().int().min(1).max(10_000_000),
  })
  .strict()

const prescriptionIntakeFields = {
  clientRequestId: z.string().trim().min(1).max(160),
  consentAccepted: z.literal(true),
  consentVersion: z.string().trim().min(1).max(80),
  customerEmail: z.string().trim().email().max(320).optional(),
  customerName: z.string().trim().min(1).max(160).optional(),
  customerPhone: z.string().trim().min(7).max(40).optional(),
  fulfilmentPreference: fulfilmentPreferenceSchema,
  media: z.array(prescriptionMediaManifestSchema).min(1).max(12),
} as const

export const prescriptionPublicChannelSchema = z
  .object({ publicToken: z.string().trim().min(20).max(200) })
  .strict()

export const prescriptionPublicIntakeSchema = z
  .object({
    ...prescriptionIntakeFields,
    publicToken: z.string().trim().min(20).max(200),
  })
  .strict()
  .refine((input) => input.customerPhone || input.customerEmail, {
    message: "Provide a phone number or email address.",
    path: ["customerPhone"],
  })

export const prescriptionMediaUploadSchema = z
  .object({
    base64: z.string().min(1).max(14_000_000),
    clientMediaId: z.string().trim().min(1).max(120),
    mediaType: prescriptionMediaManifestSchema.shape.mediaType,
    originalFileName: z.string().trim().min(1).max(255),
    pageNumber: z.number().int().min(1).max(12),
    publicToken: z.string().trim().min(20).max(200).optional(),
    storeId: storeIdSchema.optional(),
  })
  .strict()
  .refine((input) => Boolean(input.publicToken) !== Boolean(input.storeId), {
    message: "Provide exactly one public channel token or protected Store id.",
  })

export const prescriptionStaffIntakeSchema = z
  .object({
    ...prescriptionStaffIntakeFields,
    clientRequestId: prescriptionIntakeFields.clientRequestId,
    manualIntakeText: z.string().trim().min(1).max(8_000).optional(),
    media: z.array(prescriptionMediaManifestSchema).max(12),
    storeId: storeIdSchema,
  })
  .strict()
  .refine((input) => input.media.length > 0 || input.manualIntakeText, {
    message: "Add prescription media or a manual transcription.",
    path: ["media"],
  })

export const prescriptionStatusSchema = z
  .object({ statusToken: z.string().trim().min(20).max(200) })
  .strict()

export const prescriptionPaymentCheckoutSchema = z
  .object({
    acceptanceToken: z.string().trim().min(20).max(200),
    clientPaymentId: z.string().trim().min(1).max(160),
    statusToken: z.string().trim().min(20).max(200),
  })
  .strict()

export const prescriptionPaymentStatusSchema = z
  .object({ statusToken: z.string().trim().min(20).max(200) })
  .strict()

export const prescriptionRefundSchema = z
  .object({
    amountMinor: z.number().int().positive().max(100_000_000),
    clientRefundId: z.string().trim().min(1).max(160),
    orderId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionDeliverySelectionSchema = z
  .object({
    acceptanceToken: z.string().trim().min(20).max(200),
    address: z
      .object({
        addressLine1: z.string().trim().min(1).max(240),
        addressLine2: z.string().trim().max(240).optional(),
        locality: z.string().trim().min(1).max(120),
        postalCode: z.string().trim().max(40).optional(),
        recipientName: z.string().trim().min(1).max(160),
        recipientPhone: z.string().trim().min(7).max(40),
        region: z.string().trim().max(120).optional(),
      })
      .strict(),
  })
  .strict()

export const prescriptionDeliveryZoneSchema = z
  .object({
    currencyCode: z.string().trim().length(3),
    feePolicy: z.enum(["fixed", "manual"]),
    fixedFeeMinor: z.number().int().nonnegative().optional(),
    matchType: z.enum(["locality", "postal_prefix"]),
    matchValues: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
    name: z.string().trim().min(1).max(120),
    priority: z.number().int().min(-1000).max(1000).optional(),
    promiseText: z.string().trim().min(1).max(500),
    storeId: storeIdSchema,
    zoneId: z.string().trim().min(1).optional(),
  })
  .strict()

export const prescriptionPickupReadySchema = z
  .object({
    checks: z.record(z.string().trim().min(1), z.boolean()),
    fulfillmentId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionPickupHandoffSchema = z
  .object({
    clientOperationId: z.string().trim().min(1).max(160),
    collectorName: z.string().trim().min(1).max(160),
    collectorRelationship: z.string().trim().max(120).optional(),
    fulfillmentId: z.string().trim().min(1),
    pickupCode: z.string().trim().min(4).max(20),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionPickupExceptionSchema = z
  .object({
    clientOperationId: z.string().trim().min(1).max(160),
    exceptionCode: z.enum([
      "abandoned",
      "cancelled",
      "damaged_item",
      "incorrect_collector",
      "missing_item",
    ]),
    fulfillmentId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
    status: z.enum(["abandoned", "cancelled", "exception"]),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionDeliveryAssignmentSchema = z
  .object({
    courierDisplayName: z.string().trim().min(1).max(160),
    courierPhoneMasked: z.string().trim().max(40).optional(),
    courierReference: z.string().trim().min(1).max(160),
    orderId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionDeliveryReadySchema = z
  .object({
    checks: z.record(z.string().trim().min(1), z.boolean()),
    orderId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionManualDeliveryFeeSchema = z
  .object({
    addressId: z.string().trim().min(1),
    clientDecisionId: z.string().trim().min(1).max(160),
    feeMinor: z.number().int().min(0),
    reason: z.string().trim().min(1).max(500),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionDeliveryTransitionSchema = z
  .object({
    assignmentId: z.string().trim().min(1),
    clientOperationId: z.string().trim().min(1).max(160),
    proofReference: z.string().trim().max(240).optional(),
    reason: z.string().trim().max(500).optional(),
    status: z.enum([
      "cancelled",
      "collected",
      "delivered",
      "failed",
      "in_transit",
      "rescheduled",
      "returned_to_pharmacy",
    ]),
    storeId: storeIdSchema,
  })
  .strict()

export const whatsappManualConnectionSchema = z
  .object({
    accessToken: z.string().trim().min(20).max(2_000),
    billingOwner: z.string().trim().max(160).optional(),
    businessDisplayName: z.string().trim().max(160).optional(),
    displayNumber: z.string().trim().min(7).max(40),
    phoneNumberId: z.string().trim().min(1).max(160),
    storeId: storeIdSchema,
    testRecipient: z.string().trim().min(7).max(40),
    wabaId: z.string().trim().min(1).max(160),
  })
  .strict()

export const whatsappConnectionIdSchema = z
  .object({ connectionId: z.string().trim().min(1), storeId: storeIdSchema })
  .strict()

export const whatsappConnectionLifecycleSchema = z
  .object({
    connectionId: z.string().trim().min(1),
    status: z.enum(["reconnecting", "revoked", "suspended"]),
    storeId: storeIdSchema,
  })
  .strict()

export const whatsappEmbeddedSignupSessionSchema = z
  .object({
    publicToken: z.string().trim().min(32).max(200),
    storeId: storeIdSchema,
  })
  .strict()

export const whatsappEmbeddedSignupSelectionSchema =
  whatsappEmbeddedSignupSessionSchema.extend({
    billingOwner: z.string().trim().max(160).optional(),
    phoneNumberId: z.string().trim().min(1).max(160),
    testRecipient: z.string().trim().min(7).max(40),
  })

export const prescriptionRetentionPolicySchema = z
  .object({
    addressDays: z.number().int().min(1).max(3_650),
    commercialRecordDays: z.number().int().min(1).max(3_650),
    legalHold: z.boolean(),
    messageDays: z.number().int().min(1).max(3_650),
    rawMediaDays: z.number().int().min(1).max(3_650),
    secureTokenDays: z.number().int().min(1).max(3_650),
    storeId: storeIdSchema,
    transcriptDays: z.number().int().min(1).max(3_650),
  })
  .strict()

export const prescriptionPrivacyRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    requestedChanges: z
      .object({
        customerEmail: z.string().trim().email().max(240).nullable().optional(),
        customerName: z.string().trim().max(160).nullable().optional(),
        customerPhone: z.string().trim().max(40).nullable().optional(),
      })
      .strict()
      .optional(),
    storeId: storeIdSchema,
    subjectReference: z.string().trim().min(1).max(240),
    type: z.enum(["access", "correction", "erasure", "export", "restriction"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.type === "correction" &&
      (!value.requestedChanges ||
        Object.values(value.requestedChanges).every(
          (change) => change === undefined,
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Correction requests require at least one corrected field.",
        path: ["requestedChanges"],
      })
    }
  })

export const prescriptionPrivacyRequestIdSchema = z
  .object({
    privacyRequestId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionIncidentSchema = z
  .object({
    expiresAt: z.coerce.date().optional(),
    reason: z.string().trim().min(1).max(500),
    storeId: storeIdSchema,
    type: z.enum([
      "break_glass",
      "freeze_processing",
      "revoke_public_links",
      "revoke_whatsapp",
      "suspend_commerce",
    ]),
  })
  .strict()

export const prescriptionIncidentIdSchema = z
  .object({
    controlId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionReportSchema = z
  .object({
    from: z.coerce.date(),
    storeId: storeIdSchema,
    to: z.coerce.date(),
  })
  .strict()
  .refine((value) => value.from < value.to, {
    message: "Report start must be before report end.",
    path: ["from"],
  })

export const prescriptionReuploadSchema = z
  .object({
    media: z.array(prescriptionMediaManifestSchema).min(1).max(12),
    reuploadToken: z.string().trim().min(20).max(200),
  })
  .strict()

export const prescriptionQueueSchema = z
  .object({
    cursor: z.string().trim().min(1).nullable().optional(),
    pageSize: z.number().int().min(1).max(100).default(25),
    q: z.string().trim().max(120).nullable().optional(),
    sort: z
      .tuple([
        z.enum(["created_at", "reference", "source", "status", "updated_at"]),
        z.enum(["asc", "desc"]),
      ])
      .nullable()
      .optional(),
    sources: z.array(prescriptionSourceSchema).max(4).nullable().optional(),
    statuses: z
      .array(prescriptionRequestStatusSchema)
      .max(13)
      .nullable()
      .optional(),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionDetailSchema = z
  .object({ requestId: z.string().trim().min(1), storeId: storeIdSchema })
  .strict()

export const prescriptionMediaAccessSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionClearerMediaSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    requestId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionMediaReadySchema = prescriptionDetailSchema

export const prescriptionLineVerificationSchema = z
  .object({
    lineId: z.string().trim().min(1),
    status: z.enum(["unreadable", "verified"]),
    storeId: storeIdSchema,
    verifiedText: z.string().trim().min(1).max(4_000).nullable().optional(),
  })
  .strict()

export const prescriptionPharmacistReviewSchema = z
  .object({
    decision: z.enum(["declined", "needs_clarification", "released"]),
    expectedMediaRevision: z.number().int().min(1),
    expectedTranscriptRevision: z.number().int().min(1),
    lines: z
      .array(
        z
          .object({
            availability: z.enum([
              "available",
              "declined",
              "partial",
              "restricted",
              "unavailable",
            ]),
            customerWording: z.string().trim().max(1_000).nullable().optional(),
            isAlternative: z.boolean().optional(),
            offeringId: z.string().trim().min(1).nullable().optional(),
            quantity: z
              .string()
              .regex(/^\d+(?:\.\d+)?$/)
              .nullable()
              .optional(),
            transcriptionLineId: z.string().trim().min(1),
          })
          .strict(),
      )
      .max(100),
    reason: z.string().trim().max(1_000).nullable().optional(),
    requestId: z.string().trim().min(1),
    storeId: storeIdSchema,
  })
  .strict()

export const prescriptionQuoteIssueSchema = z
  .object({
    availabilityOutcome: z.enum(["full", "partial", "unavailable"]),
    clientQuoteId: z.string().trim().min(1).max(160),
    clientVersionId: z.string().trim().min(1).max(160),
    customerNote: z.string().trim().max(2_000).nullable().optional(),
    discountMinor: z.number().int().min(0).optional(),
    expiresAt: z.coerce.date().optional(),
    fulfilmentPromise: z.string().trim().max(1_000).nullable().optional(),
    lines: z
      .array(
        z
          .object({
            transcriptionLineId: z.string().trim().min(1),
            unitPriceMinor: z.number().int().min(0).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    requestId: z.string().trim().min(1),
    storeId: storeIdSchema,
    taxMinor: z.number().int().min(0).optional(),
  })
  .strict()

export const prescriptionPublicQuoteSchema = z
  .object({ acceptanceToken: z.string().trim().min(20).max(200) })
  .strict()

export const prescriptionPublicQuoteAcceptSchema = z
  .object({
    acceptanceToken: z.string().trim().min(20).max(200),
    clientAcceptanceId: z.string().trim().min(1).max(160),
    partialAcknowledged: z.boolean(),
  })
  .strict()
