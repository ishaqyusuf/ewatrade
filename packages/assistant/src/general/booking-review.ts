import { z } from "zod"

// Authenticated application display only. Parsing grants no source, action,
// Finance, media, original-navigation or approval authority.
const id = z.string().min(1).max(191)
const revision = z.number().int().min(0).max(2_147_483_647)
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const amount = z.number().int().min(0).max(2_147_483_647)
const signedAmount = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
const instant = z.string().datetime()
const currency = z.string().regex(/^[A-Z]{3}$/)
const timezone = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value })
      return true
    } catch {
      return false
    }
  })
const bookingStatus = z.enum([
  "scheduled",
  "confirmed",
  "arrived",
  "in_service",
  "completed",
  "cancelled",
  "no_show",
])
const lineStatus = z.enum([
  "QUEUED",
  "IN_PROGRESS",
  "BLOCKED",
  "READY_FOR_HANDOFF",
  "COMPLETED",
  "CANCELLED",
])
const authorization = z.enum([
  "PENDING_PAYMENT",
  "PENDING_RELEASE",
  "AUTHORIZED",
  "REVOKED",
])
const paymentStatus = z.enum([
  "NOT_REQUIRED",
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
])
const requirement = z.enum(["NONE", "DEPOSIT", "FULL"])
const refundPolicy = z.enum(["NONE", "FULL_BEFORE_CUTOFF", "MANUAL_REVIEW"])
const workPolicy = z.enum(["CHARGE_ONLY", "TRACKED"])
const authorizationPolicy = z.enum([
  "ON_ORDER_CONFIRMATION",
  "AFTER_REQUIRED_PAYMENT",
  "MANUAL_RELEASE",
])
// Preserve canonical Decimal.toString() verbatim, including exact exponent form.
// Validate Decimal(38,6)'s 32 whole/6 fractional digits without Number(quantity).
export const generalBookingReviewDecimalSchema = z
  .string()
  .max(128)
  .refine((value) => {
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,3}))?$/.exec(value)
    if (!match) return false
    const whole = match[1] ?? ""
    const digits = whole + (match[2] ?? "")
    const first = digits.search(/[1-9]/)
    if (first < 0) return true
    const last = digits.search(/0*$/) - 1
    const point = BigInt(whole.length) + BigInt(match[3] ?? "0")
    return point - BigInt(first) <= 32n && BigInt(last + 1) - point <= 6n
  })
const decimal = generalBookingReviewDecimalSchema
const source = z
  .object({
    id,
    revision,
    status: z.enum([
      "SUBMITTED",
      "NEEDS_INFORMATION",
      "QUOTED",
      "DECLINED",
      "WITHDRAWN",
      "CONVERTED",
    ]),
  })
  .strict()
const links = z
  .object({
    holdId: id.nullable(),
    quoteVersionId: id.nullable(),
    commercialOrderId: id.nullable(),
    serviceJobId: id.nullable(),
  })
  .strict()
const savedPolicy = z
  .object({
    offering: revision,
    payment: revision,
    cancellation: revision,
    paymentRequirement: requirement,
    currency,
    payable: amount,
    required: amount,
    deposit: amount.nullable(),
    paymentStatus,
    cancellationWindow: count,
    refundPolicy,
    reminderLeadMinutes: count,
  })
  .strict()
const milestones = z
  .object({
    confirmedAt: instant.nullable(),
    arrivedAt: instant.nullable(),
    serviceStartedAt: instant.nullable(),
    completedAt: instant.nullable(),
    cancelledAt: instant.nullable(),
    noShowAt: instant.nullable(),
  })
  .strict()
const before = z
  .object({
    id,
    revision,
    status: bookingStatus,
    sourceId: id,
    offeringId: id,
    resourceId: id,
    startAt: instant,
    endAt: instant,
    quantity: z.number().int().min(1).max(10_000),
    timezone,
    links,
    savedPolicy,
    milestones,
  })
  .strict()
const notification = z
  .object({
    intent: z.enum(["may_create_durable_intent", "not_created"]),
    delivery: z.literal("unverified"),
  })
  .strict()
const order = z
  .object({
    id,
    status: z.enum([
      "DRAFT",
      "PENDING",
      "CONFIRMED",
      "FULFILLING",
      "READY_FOR_PICKUP",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
    ]),
    completedAt: instant.nullable(),
    currencyCode: currency,
    totalMinor: amount,
    paymentStatus: z.enum([
      "PENDING",
      "PARTIALLY_PAID",
      "AUTHORIZED",
      "PAID",
      "FAILED",
      "REFUNDED",
    ]),
    acceptedQuoteVersionId: id.nullable(),
  })
  .strict()
const slot = z
  .object({
    configuration: z
      .object({
        offeringId: id,
        revision,
        status: z.literal("ACTIVE"),
        durationMinutes: count,
        leadTimeMinutes: count,
        bookingHorizonMinutes: count,
        holdDurationMinutes: count,
        paymentRequirement: requirement,
        depositAmountMinor: amount.nullable(),
        paymentPolicyRevision: revision,
        cancellationPolicyRevision: revision,
        cancellationWindowMinutes: count,
        refundPolicy,
        capacity: count,
        createdAt: instant,
        updatedAt: instant,
        resources: z.array(
          z.object({ resourceId: id, capacityRequired: count }).strict(),
        ),
      })
      .strict(),
    resource: z
      .object({
        id,
        name: z.string().min(1),
        kind: z.enum(["STAFF", "ROOM", "EQUIPMENT", "OTHER"]),
        capacity: count,
        revision,
      })
      .strict(),
    settings: z
      .object({
        revision,
        timezone,
        defaultSlotInterval: count,
        defaultHoldMinutes: count,
        reminderLeadMinutes: count,
      })
      .strict(),
    evaluation: z
      .object({
        eligible: z.boolean(),
        reason: z.string().nullable(),
        remainingCapacity: count,
      })
      .strict(),
  })
  .strict()
const workLine = z
  .object({
    id,
    revision,
    status: lineStatus,
    authorizationStatus: authorization,
    allocatedQuantity: decimal,
    reworkOfLineId: id.nullable(),
    completedAt: instant.nullable(),
  })
  .strict()
const obligationWorkLine = workLine.omit({ revision: true })
const obligation = z
  .object({
    id,
    kind: z.enum(["PRODUCT_UNIT", "SERVICE"]),
    quantity: decimal,
    productFulfillments: z.array(
      z.object({ createdAt: instant, quantity: decimal }).strict(),
    ),
    snapshot: z
      .object({
        serviceAuthorizationPolicy: authorizationPolicy.nullable(),
        serviceWorkPolicy: workPolicy.nullable(),
      })
      .strict()
      .nullable(),
    serviceAuthorization: z
      .object({ authorizedAt: instant, quantity: decimal })
      .strict()
      .nullable(),
    serviceFulfillment: z
      .object({ performedAt: instant, quantity: decimal })
      .strict()
      .nullable(),
    serviceJobLines: z.array(obligationWorkLine),
  })
  .strict()
const work = z
  .object({
    jobId: id,
    jobRevision: revision,
    lines: z.array(workLine),
    changes: z.array(
      z
        .object({
          id,
          revision,
          fromStatus: lineStatus,
          toStatus: lineStatus,
          completedAt: z.enum(["command_time", "unchanged"]),
        })
        .strict(),
    ),
    jobRevisionIncrement: z.boolean(),
    jobCompletedAt: z.enum(["command_time", "unchanged"]),
    obligations: z.array(obligation).nullable(),
    wouldCompleteOrder: z.boolean(),
  })
  .strict()
const cancellation = z
  .object({
    netPaidMinor: signedAmount,
    cancellationAllowed: z.boolean(),
    refundExecuted: z.literal(false),
    consequence: z
      .object({
        bookingId: id,
        cancellationAllowed: z.boolean(),
        refundAmountMinor: amount.nullable(),
        refundOutcome: z.enum(["none", "manual_review", "refund_eligible"]),
        stateRevision: revision,
      })
      .strict(),
  })
  .strict()
const effects = {
  status: bookingStatus,
  revision,
  resourceId: id,
  startAt: instant,
  endAt: instant,
  reasonCode: z.string().min(1).max(80).nullable(),
  privateAccess: z.enum(["rotate_private_manage", "revoke_private_manage"]),
  notification: notification.nullable(),
  pendingReminders: z.array(
    z
      .object({
        status: z.literal("PENDING"),
        type: z.literal("REMINDER"),
        scheduledFor: instant,
      })
      .strict(),
  ),
  cancelPendingReminders: z.boolean(),
  reminderLeadMinutes: count.nullable(),
  paymentCollected: z.literal(false),
  providerSettlement: z.literal("not_checked"),
}
const common = {
  format: z.literal("general_booking_review_v1"),
  draft: z
    .object({
      ref: id,
      revision: revision.min(1),
      conversationId: z.string().min(1).max(128),
      expiresAt: instant,
    })
    .strict(),
  source,
  coverage: z
    .object({
      complete: z.literal(true),
      workLines: count,
      workChanges: count,
      obligations: count.nullable(),
      obligationWorkLines: count,
      productFulfillments: count,
      pendingReminders: count,
    })
    .strict(),
}
const holdReview = z
  .object({
    ...common,
    action: z.literal("service_booking_hold"),
    details: z
      .object({
        kind: z.literal("hold"),
        slot,
        effects: z
          .object({
            quantity: z.number().int().min(1).max(10_000),
            source: z.object({ kind: z.literal("service"), id }).strict(),
            offeringId: id,
            resourceId: id,
            startAt: instant,
            endAt: instant,
            expiryRule: z
              .object({
                beforeSlotMilliseconds: z.literal(1),
                holdDurationMinutes: count,
              })
              .strict(),
            reservation: z.literal("temporary_hold"),
            bookingCreated: z.literal(false),
            payment: z.literal("not_checked"),
            notification: z.literal("none"),
            privateAccess: z.literal("private_confirm_created"),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
const confirmReview = z
  .object({
    ...common,
    action: z.literal("service_booking_confirm"),
    details: z
      .object({
        kind: z.literal("confirm"),
        before: z
          .object({
            holdId: id,
            status: z.literal("HELD"),
            sourceId: id,
            resourceId: id,
            startAt: instant,
            endAt: instant,
            expiresAt: instant,
            quantity: z.number().int().min(1).max(10_000),
            configurationRevision: revision,
          })
          .strict(),
        slot,
        payment: z
          .object({
            currencyCode: currency,
            depositAmountMinor: amount.nullable(),
            payableAmountMinor: amount,
            requiredPaymentMinor: amount,
            paymentStatus,
          })
          .strict(),
        quoteVersion: z
          .object({
            id,
            quoteId: id,
            version: revision.min(1),
            status: z.literal("ACCEPTED"),
            currencyCode: currency,
            totalMinor: amount,
            expiresAt: instant.nullable(),
            acceptedOrderId: id.nullable(),
          })
          .strict()
          .nullable(),
        order: order.nullable(),
        job: z
          .object({ id, commercialOrderId: id.nullable(), revision })
          .strict()
          .nullable(),
        effects: z
          .object({
            status: z.literal("confirmed"),
            revision: z.literal(0),
            consumesHoldId: id,
            privateAccess: z.literal("rotate_confirm_create_private_manage"),
            notification,
            reminderLeadMinutes: count,
            paymentCollected: z.literal(false),
            providerSettlement: z.literal("not_checked"),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
function revised<const A extends string, const K extends string>(
  action: A,
  kind: K,
) {
  return z
    .object({
      ...common,
      action: z.literal(action),
      details: z
        .object({
          kind: z.literal(kind),
          before,
          order: order.nullable(),
          slot: slot.nullable(),
          cancellation: cancellation.nullable(),
          work: work.nullable(),
          effects: z.object(effects).strict(),
        })
        .strict(),
    })
    .strict()
}
/** Arrays deliberately have NO row cap: complete native work, never first-N. */
export const generalBookingReviewSchema = z
  .discriminatedUnion("action", [
    holdReview,
    confirmReview,
    revised("service_booking_arrive", "arrive"),
    revised("service_booking_start", "start"),
    revised("service_booking_complete", "complete"),
    revised("service_booking_cancel", "cancel"),
    revised("service_booking_no_show", "mark_no_show"),
    revised("service_booking_reschedule", "reschedule"),
  ])
  .superRefine((document, context) => {
    const details = document.details
    const w = "work" in details ? details.work : null
    const reminders =
      "pendingReminders" in details.effects
        ? details.effects.pendingReminders
        : []
    const actual = {
      complete: true,
      workLines: w?.lines.length ?? 0,
      workChanges: w?.changes.length ?? 0,
      obligations: w?.obligations?.length ?? null,
      obligationWorkLines:
        w?.obligations?.reduce((n, row) => n + row.serviceJobLines.length, 0) ??
        0,
      productFulfillments:
        w?.obligations?.reduce(
          (n, row) => n + row.productFulfillments.length,
          0,
        ) ?? 0,
      pendingReminders: reminders.length,
    }
    for (const key of Object.keys(actual))
      if (Reflect.get(actual, key) !== Reflect.get(document.coverage, key))
        context.addIssue({
          code: "custom",
          message: "Complete section counts must match every row.",
          path: ["coverage", key],
        })
    if (w) {
      for (const rows of [w.lines, w.changes, w.obligations ?? []])
        if (new Set(rows.map((row) => row.id)).size !== rows.length)
          context.addIssue({
            code: "custom",
            message: "Exact business line identities must be unique.",
          })
      const lineIds = new Set(w.lines.map((row) => row.id))
      if (w.changes.some((row) => !lineIds.has(row.id)))
        context.addIssue({
          code: "custom",
          message: "Changes must retain their original work line.",
        })
    }
    if ("work" in details) {
      const kind = details.kind
      if (
        (kind === "reschedule") !== (details.slot !== null) ||
        (kind === "cancel") !== (details.cancellation !== null) ||
        (!["start", "complete"].includes(kind) && details.work !== null) ||
        (kind !== "complete" &&
          details.work?.obligations !== null &&
          details.work !== null)
      )
        context.addIssue({
          code: "custom",
          message: "Keep the canonical operation's exact evaluated sections.",
        })
    }
  })
export type GeneralBookingReview = z.infer<typeof generalBookingReviewSchema>
/** Never part of semantic document bytes/identity. ONLY these two observations
 * vary without changing the private canonical target. Saved expiry stays bound. */
export const generalBookingReviewObservationsSchema = z
  .object({
    asOf: instant,
    observedHoldExpiresAt: instant.nullable(),
  })
  .strict()
export type GeneralBookingReviewObservations = z.infer<
  typeof generalBookingReviewObservationsSchema
>
