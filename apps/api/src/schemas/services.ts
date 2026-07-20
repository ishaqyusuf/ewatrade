import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const exactServiceQuantitySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, {
        allowZero: false,
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      })
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid exact quantity.",
      })
    }
  })
  .transform((value) =>
    parseExactDecimal(value, {
      allowZero: false,
      maxScale: EXACT_QUANTITY_MAX_SCALE,
    }),
  )

const intakeLineSchema = z
  .object({
    approvedQuotePriceMinor: z.number().int().nonnegative().optional(),
    expectedFixedPriceMinor: z.number().int().nonnegative().optional(),
    offeringId: z.string().trim().min(1),
    quantity: exactServiceQuantitySchema,
  })
  .strict()

const commercialPaymentMethodSchema = z.enum([
  "bank_transfer",
  "card",
  "cash",
  "other",
  "pos",
])

export const serviceIntakeCreateSchema = z
  .object({
    clientIntakeId: z.string().trim().min(8).max(160),
    conditionNote: z.string().trim().max(2_000).optional(),
    customerEmail: z.string().trim().email().max(320).optional(),
    customerName: z.string().trim().max(160).optional(),
    customerPhone: z.string().trim().max(40).optional(),
    dueCommitmentAt: z.coerce.date().optional(),
    instructions: z.string().trim().max(4_000).optional(),
    initialPaymentMethod: commercialPaymentMethodSchema.optional(),
    initialPaymentMinor: z
      .number()
      .int()
      .nonnegative()
      .max(100_000_000)
      .optional(),
    initialPaymentReference: z.string().trim().max(160).optional(),
    lines: z.array(intakeLineSchema).min(1).max(100),
    notificationChannel: z.enum(["sms", "whatsapp"]).optional(),
    priority: z.enum(["normal", "urgent"]).optional(),
    requestedAssigneeId: z.string().trim().min(1).optional(),
    requestedAt: z.coerce.date().optional(),
    schemaVersion: z.literal(1),
    serviceLevel: z.enum(["express", "standard"]).optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const serviceIntakeConfirmSchema = z
  .object({
    intakeId: z.string().trim().min(1),
    schemaVersion: z.literal(1),
  })
  .strict()

export const serviceJobLineTransitionSchema = z
  .object({
    clientCommandId: z.string().trim().min(8).max(160),
    effectiveAt: z.coerce.date().optional(),
    expectedRevision: z.number().int().nonnegative(),
    lineId: z.string().trim().min(1),
    reason: z.string().trim().max(500).optional(),
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(80),
    toStatus: z.enum([
      "blocked",
      "cancelled",
      "completed",
      "in_progress",
      "queued",
      "ready_for_handoff",
    ]),
  })
  .strict()

export const serviceJobLineAuthorizeSchema = z
  .object({
    clientCommandId: z.string().trim().min(8).max(160),
    expectedRevision: z.number().int().nonnegative(),
    lineId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
    source: z.enum(["manual_release", "payment"]),
  })
  .strict()

export const serviceJobLineSplitSchema = z
  .object({
    clientCommandId: z.string().trim().min(8).max(160),
    expectedRevision: z.number().int().nonnegative(),
    lineId: z.string().trim().min(1),
    quantity: exactServiceQuantitySchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceJobAssignSchema = z
  .object({
    assigneeUserId: z.string().trim().min(1),
    expectedRevision: z.number().int().nonnegative(),
    jobId: z.string().trim().min(1),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()

export const serviceJobRescheduleSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    jobId: z.string().trim().min(1),
    promisedAt: z.coerce.date(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceJobHandoffSchema = z
  .object({
    clientCommandId: z.string().trim().min(8).max(160),
    expectedRevision: z.number().int().nonnegative(),
    jobId: z.string().trim().min(1),
    note: z.string().trim().max(500).optional(),
    payment: z
      .object({
        amountMinor: z.number().int().positive().max(100_000_000),
        method: commercialPaymentMethodSchema,
        reference: z.string().trim().max(160).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const serviceBatchUpdateSchema = z
  .object({
    action: z.enum(["delay", "mark_in_progress", "mark_ready"]),
    jobs: z
      .array(
        z
          .object({
            expectedRevision: z.number().int().nonnegative(),
            jobId: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    reason: z.string().trim().min(1).max(500),
    shiftMinutes: z.number().int().positive().max(525_600).optional(),
  })
  .strict()

export const serviceSettingsGetSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()

export const serviceSettingsUpdateSchema = z
  .object({
    autoNotifyReady: z.boolean(),
    autoNotifyReminder: z.boolean(),
    defaultNotificationChannel: z.enum(["sms", "whatsapp"]).optional(),
    expressEnabled: z.boolean(),
    expressLabel: z.string().trim().min(1).max(80),
    expressSurchargeType: z.enum(["fixed", "percentage"]),
    expressSurchargeValue: z.number().int().nonnegative().max(100_000_000),
    expressTurnaroundMinutes: z
      .number()
      .int()
      .positive()
      .max(525_600)
      .optional(),
    reminderLeadMinutes: z.number().int().nonnegative().max(525_600),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const serviceJobNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(4_000),
    clientCommandId: z.string().trim().min(8).max(160),
    jobId: z.string().trim().min(1),
    lineId: z.string().trim().min(1).optional(),
  })
  .strict()

export const serviceJobExceptionSchema = z
  .object({
    description: z.string().trim().min(1).max(2_000),
    jobId: z.string().trim().min(1),
    lineId: z.string().trim().min(1).optional(),
    type: z.enum([
      "customer_rejection",
      "delay",
      "failed_attempt",
      "other",
      "quality",
    ]),
  })
  .strict()

export const serviceJobReworkSchema = z
  .object({
    clientCommandId: z.string().trim().min(8).max(160),
    lineId: z.string().trim().min(1),
    quantity: exactServiceQuantitySchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceEvidenceCaptureSchema = z
  .object({
    assetReference: z.string().trim().max(1_000).optional(),
    capturedAt: z.coerce.date().optional(),
    clientEvidenceId: z.string().trim().min(8).max(160),
    jobId: z.string().trim().min(1),
    label: z.string().trim().max(160).optional(),
    lineId: z.string().trim().min(1).optional(),
    mediaType: z.enum(["file", "photo", "video"]),
    purpose: z.enum([
      "approval",
      "completion",
      "exception",
      "handoff",
      "intake_condition",
      "other",
      "progress",
    ]),
    uploadStatus: z.enum(["failed", "local", "queued"]).optional(),
  })
  .strict()

export const serviceEvidenceUploadSchema = z
  .object({
    assetReference: z.string().trim().max(1_000).optional(),
    evidenceId: z.string().trim().min(1),
    failureReason: z.string().trim().max(500).optional(),
    status: z.enum(["failed", "queued", "uploading"]),
  })
  .strict()

export const serviceEvidencePublishSchema = z
  .object({ evidenceId: z.string().trim().min(1) })
  .strict()

export const serviceEvidenceRevokeSchema = z
  .object({
    evidenceId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceJobGetSchema = z
  .object({ jobId: z.string().trim().min(1) })
  .strict()

export const serviceWorkQueueSchema = z
  .object({
    assigneeUserId: z.string().trim().min(1).optional(),
    due: z.enum(["all", "overdue", "today"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    priority: z.enum(["normal", "urgent"]).optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const serviceRequestFormCreateSchema = z
  .object({
    activeFrom: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    label: z.string().trim().min(1).max(160),
    offeringIds: z.array(z.string().trim().min(1)).min(1).max(100),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const serviceRequestFormListSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()

export const serviceRequestListSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    status: z
      .enum([
        "submitted",
        "needs_information",
        "quoted",
        "declined",
        "converted",
      ])
      .optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const publicServiceRequestSubmitSchema = z
  .object({
    clientRequestId: z.string().trim().min(8).max(160),
    customerEmail: z.string().trim().email().max(320).optional(),
    customerName: z.string().trim().min(1).max(160),
    customerPhone: z.string().trim().max(40).optional(),
    details: z.string().trim().max(4_000).optional(),
    formToken: z.string().trim().min(20).max(500),
    lines: z
      .array(
        z
          .object({
            details: z.string().trim().max(2_000).optional(),
            offeringId: z.string().trim().min(1),
            quantity: exactServiceQuantitySchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    requestedAt: z.coerce.date().optional(),
  })
  .strict()

export const publicServiceRequestFormSchema = z
  .object({ formToken: z.string().trim().min(20).max(500) })
  .strict()

export const serviceRequestDispositionSchema = z
  .object({
    requestId: z.string().trim().min(1),
    response: z.string().trim().min(1).max(2_000),
    status: z.enum(["declined", "needs_information"]),
  })
  .strict()

export const serviceQuoteIssueSchema = z
  .object({
    clientQuoteId: z.string().trim().min(8).max(160),
    clientVersionId: z.string().trim().min(8).max(160),
    discountMinor: z.number().int().nonnegative().optional(),
    expiresAt: z.coerce.date().optional(),
    lines: z
      .array(
        z
          .object({
            offeringId: z.string().trim().min(1),
            quantity: exactServiceQuantitySchema,
            unitPriceMinor: z.number().int().nonnegative().max(100_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    requestId: z.string().trim().min(1).optional(),
    storeId: z.string().trim().min(1).optional(),
    taxMinor: z.number().int().nonnegative().optional(),
  })
  .strict()

export const publicServiceQuoteAcceptSchema = z
  .object({
    acceptanceToken: z.string().trim().min(20).max(500),
    clientAcceptanceId: z.string().trim().min(8).max(160),
  })
  .strict()

export const publicServiceQuoteSchema = z
  .object({ acceptanceToken: z.string().trim().min(20).max(500) })
  .strict()

export const serviceTrackingCreateSchema = z
  .object({
    customerScopeKey: z.string().trim().min(1).max(160),
    expiresAt: z.coerce.date().optional(),
    jobId: z.string().trim().min(1),
  })
  .strict()

export const serviceTrackingRevokeSchema = z
  .object({ accessId: z.string().trim().min(1) })
  .strict()

export const publicServiceTrackingSchema = z
  .object({ trackingToken: z.string().trim().min(20).max(500) })
  .strict()

export const serviceNotificationIntentSchema = z
  .object({
    audienceKey: z.string().trim().min(1).max(160),
    businessEventKey: z.string().trim().min(1).max(160),
    channel: z.enum(["sms", "whatsapp"]),
    customerEmail: z.string().trim().email().max(320).optional(),
    customerPhone: z.string().trim().max(40).optional(),
    jobId: z.string().trim().min(1),
    renderedMessage: z.string().trim().min(1).max(4_000),
    renderedSubject: z.string().trim().max(200).optional(),
    scheduledFor: z.coerce.date().optional(),
    templatePurpose: z.string().trim().min(1).max(120),
  })
  .strict()

export const serviceBatchNotificationIntentSchema = z
  .object({
    channel: z.enum(["sms", "whatsapp"]),
    clientBatchId: z.string().trim().min(1).max(120),
    jobs: z
      .array(
        z
          .object({
            jobId: z.string().trim().min(1),
            message: z.string().trim().min(1).max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    scheduledFor: z.coerce.date().optional(),
    templatePurpose: z.string().trim().min(1).max(120),
  })
  .strict()

export const serviceManualShareSchema = z
  .object({
    channel: z.enum(["email", "manual", "sms", "whatsapp"]).optional(),
    intentId: z.string().trim().min(1),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

export const serviceDeliveryAttemptSchema = z
  .object({
    channel: z.enum(["email", "sms", "whatsapp"]),
    failureCode: z.string().trim().max(120).optional(),
    failureMessage: z.string().trim().max(500).optional(),
    intentId: z.string().trim().min(1),
    providerAttemptId: z.string().trim().max(160).optional(),
    providerKey: z.string().trim().min(1).max(80),
    status: z.enum(["delivered", "failed", "pending", "sent"]),
  })
  .strict()

export const serviceReportSchema = z
  .object({
    from: z.coerce.date().optional(),
    storeId: z.string().trim().min(1).optional(),
    to: z.coerce.date().optional(),
  })
  .strict()

export const serviceAuditExportSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()
