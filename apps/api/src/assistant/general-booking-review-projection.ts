import { CommerceQuoteReviewBudgetError } from "@ewatrade/db/commerce-quote-review-budget"
import type { StaffServiceCommerceBookingCommandReview } from "@ewatrade/db/service-booking-command-review"
import type { Prisma } from "@ewatrade/db/types"
import {
  generalBookingReviewObservationsSchema,
  generalBookingReviewSchema,
} from "../../../../packages/assistant/src/general/booking-review"
import { ServiceCommerceBookingError } from "../../../../packages/db/src/queries/service-commerce-bookings/shared"
import { ServiceCommercePolicyError } from "../../../../packages/db/src/queries/service-commerce-policy"
import {
  GeneralBookingDraftStoreError,
  readGeneralBookingDraftInTransaction,
} from "./general-booking-draft-store"
import {
  bookingReviewWork,
  bookingReviewDate as date,
  bookingReviewOptionalDate as optionalDate,
} from "./general-booking-review-projection-work"

type Parent = StaffServiceCommerceBookingCommandReview
type Details = Parent["review"]["details"]
type Slot = NonNullable<Details["slot"]>
type Saved = Awaited<ReturnType<typeof readGeneralBookingDraftInTransaction>>

function slot(value: Slot) {
  const c = value.config
  const r = value.resource
  const s = value.settings
  return {
    configuration: {
      offeringId: c.offeringId,
      revision: c.revision,
      status: c.status,
      durationMinutes: c.durationMinutes,
      leadTimeMinutes: c.leadTimeMinutes,
      bookingHorizonMinutes: c.bookingHorizonMinutes,
      holdDurationMinutes: c.holdDurationMinutes,
      paymentRequirement: c.paymentRequirement,
      depositAmountMinor: c.depositAmountMinor,
      paymentPolicyRevision: c.paymentPolicyRevision,
      cancellationPolicyRevision: c.cancellationPolicyRevision,
      cancellationWindowMinutes: c.cancellationWindowMinutes,
      refundPolicy: c.refundPolicy,
      capacity: c.capacity,
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt),
      resources: c.resources.map((row) => ({
        resourceId: row.resourceId,
        capacityRequired: row.capacityRequired,
      })),
    },
    resource: {
      id: r.id,
      name: r.name,
      kind: r.kind,
      capacity: r.capacity,
      revision: r.revision,
    },
    settings: {
      revision: s.revision,
      timezone: s.timezone,
      defaultSlotInterval: s.defaultSlotInterval,
      defaultHoldMinutes: s.defaultHoldMinutes,
      reminderLeadMinutes: s.reminderLeadMinutes,
    },
    evaluation: {
      eligible: value.evaluation.eligible,
      reason: "reason" in value.evaluation ? value.evaluation.reason : null,
      remainingCapacity: value.evaluation.remainingCapacity,
    },
  }
}
function order(value: Extract<Details, { order: unknown }>["order"]) {
  if (value === null) return null
  return {
    id: value.id,
    status: value.status,
    completedAt: optionalDate(value.completedAt),
    currencyCode: value.currencyCode,
    totalMinor: value.totalMinor,
    paymentStatus: value.paymentStatus,
    acceptedQuoteVersionId: value.acceptedCommerceQuoteVersion?.id ?? null,
  }
}
function notification(
  value: Extract<Details, { payment: unknown }>["effects"]["notification"],
) {
  return { intent: value.intent, delivery: value.delivery }
}
// Deliberately private: callers cannot supply a purported canonical parent to
// obtain an application review. Only the actual signed saved-draft reader below
// can reach this mapper, after its fresh canonical authority/target comparison.
function project(saved: Saved) {
  const d = saved.review.review.details
  const source = {
    id: d.source.id,
    revision: d.source.revision,
    status: d.source.status,
  }
  let details: unknown
  if ("observedExpiresAt" in d.effects) {
    if (d.slot === null || d.before !== null)
      throw Error("Unsupported hold review")
    const e = d.effects
    details = {
      kind: "hold",
      slot: slot(d.slot),
      effects: {
        quantity: e.quantity,
        source: { kind: e.source.kind, id: e.source.id },
        offeringId: e.offeringId,
        resourceId: e.resourceId,
        startAt: date(e.startAt),
        endAt: date(e.endAt),
        expiryRule: {
          beforeSlotMilliseconds: e.expiryRule.beforeSlotMilliseconds,
          holdDurationMinutes: e.expiryRule.holdDurationMinutes,
        },
        reservation: e.reservation,
        bookingCreated: e.bookingCreated,
        payment: e.payment,
        notification: e.notification,
        privateAccess: e.capability,
      },
    }
  } else if ("payment" in d) {
    const b = d.before
    const e = d.effects
    const q = d.quoteVersion
    details = {
      kind: "confirm",
      before: {
        holdId: b.holdId,
        status: b.status,
        sourceId: b.sourceId,
        resourceId: b.resourceId,
        startAt: date(b.startAt),
        endAt: date(b.endAt),
        expiresAt: date(b.expiresAt),
        quantity: b.quantity,
        configurationRevision: b.configurationRevision,
      },
      slot: slot(d.slot),
      payment: {
        currencyCode: d.payment.currencyCode,
        depositAmountMinor: d.payment.depositAmountMinor,
        payableAmountMinor: d.payment.payableAmountMinor,
        requiredPaymentMinor: d.payment.requiredPaymentMinor,
        paymentStatus: d.payment.paymentStatus,
      },
      quoteVersion:
        q === null
          ? null
          : {
              id: q.id,
              quoteId: q.quoteId,
              version: q.version,
              status: q.status,
              currencyCode: q.currencyCode,
              totalMinor: q.totalMinor,
              expiresAt: optionalDate(q.expiresAt),
              acceptedOrderId: q.acceptedOrderId,
            },
      order: order(d.order),
      job:
        d.job === null
          ? null
          : {
              id: d.job.id,
              commercialOrderId: d.job.commercialOrderId,
              revision: d.job.revision,
            },
      effects: {
        status: e.status,
        revision: e.revision,
        consumesHoldId: e.consumesHoldId,
        privateAccess: e.capability,
        notification: notification(e.notification),
        reminderLeadMinutes: e.reminderLeadMinutes,
        paymentCollected: e.paymentCollected,
        providerSettlement: e.providerSettlement,
      },
    }
  } else if ("work" in d) {
    const b = d.before
    const p = b.savedPolicy
    const m = b.milestones
    const e = d.effects
    const c = d.cancellation
    details = {
      kind: e.kind,
      before: {
        id: b.id,
        revision: b.revision,
        status: b.status,
        sourceId: b.sourceId,
        offeringId: b.offeringId,
        resourceId: b.resourceId,
        startAt: date(b.startAt),
        endAt: date(b.endAt),
        quantity: b.quantity,
        timezone: b.timezone,
        links: {
          holdId: b.links.holdId,
          quoteVersionId: b.links.quoteVersionId,
          commercialOrderId: b.links.commercialOrderId,
          serviceJobId: b.links.serviceJobId,
        },
        savedPolicy: {
          offering: p.offering,
          payment: p.payment,
          cancellation: p.cancellation,
          paymentRequirement: p.paymentRequirement,
          currency: p.currency,
          payable: p.payable,
          required: p.required,
          deposit: p.deposit,
          paymentStatus: p.paymentStatus,
          cancellationWindow: p.cancellationWindow,
          refundPolicy: p.refundPolicy,
          reminderLeadMinutes: p.reminderLeadMinutes,
        },
        milestones: {
          confirmedAt: optionalDate(m.confirmedAt),
          arrivedAt: optionalDate(m.arrivedAt),
          serviceStartedAt: optionalDate(m.serviceStartedAt),
          completedAt: optionalDate(m.completedAt),
          cancelledAt: optionalDate(m.cancelledAt),
          noShowAt: optionalDate(m.noShowAt),
        },
      },
      order: order(d.order),
      slot: d.slot === null ? null : slot(d.slot),
      work: bookingReviewWork(d.work),
      cancellation:
        c === null
          ? null
          : {
              netPaidMinor: c.netPaidMinor,
              cancellationAllowed: c.cancellationAllowed,
              refundExecuted: c.refundExecuted,
              consequence: {
                bookingId: c.consequence.bookingId,
                cancellationAllowed: c.consequence.cancellationAllowed,
                refundAmountMinor: c.consequence.refundAmountMinor,
                refundOutcome: c.consequence.refundOutcome,
                stateRevision: c.consequence.stateRevision,
              },
            },
      effects: {
        status: e.status,
        revision: e.revision,
        resourceId: e.resourceId,
        startAt: date(e.startAt),
        endAt: date(e.endAt),
        reasonCode: e.reasonCode,
        privateAccess: e.capability,
        notification:
          e.notification === null ? null : notification(e.notification),
        pendingReminders: e.pendingReminders.map((row) => ({
          status: row.status,
          type: row.type,
          scheduledFor: date(row.scheduledFor),
        })),
        cancelPendingReminders: e.cancelPendingReminders,
        reminderLeadMinutes: e.reminderLeadMinutes,
        paymentCollected: e.paymentCollected,
        providerSettlement: e.providerSettlement,
      },
    }
  } else throw Error("Unsupported booking review")
  const w = "work" in d ? d.work : null
  const reminders =
    "pendingReminders" in d.effects ? d.effects.pendingReminders : []
  return generalBookingReviewSchema.parse({
    format: "general_booking_review_v1",
    action: saved.payload.action,
    draft: {
      ref: saved.row.id,
      revision: saved.row.revision,
      conversationId: saved.row.conversationId,
      expiresAt: date(saved.row.expiresAt),
    },
    source,
    details,
    coverage: {
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
    },
  })
}

/** UNEXPOSED SERVER-ONLY composition, NOT an endpoint or authorization grant.
 * Caller owns fresh GENERAL Session/account/privacy/legal/client/rollout checks
 * and one consistent owning TX. Exactly ONE actual saved/full-canonical read.
 * NEVER serialize the whole result: ONLY review/observations are app-safe.
 * privateBinding belongs solely in a protected server checkpoint/signing basis;
 * it is not a token, confirmation, model projection or evidence of human review.
 * Arrays preserve native completeness; this mapper is not a wire/memory bound.
 */
export async function readGeneralBookingAppReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof readGeneralBookingDraftInTransaction>[1],
  signingKey: string,
) {
  const unavailable = {
    kind: "unavailable" as const,
    reason: "complete_review_unavailable" as const,
  }
  let saved: Saved
  try {
    saved = await readGeneralBookingDraftInTransaction(tx, input, signingKey)
  } catch (error) {
    if (
      error instanceof GeneralBookingDraftStoreError ||
      error instanceof ServiceCommerceBookingError ||
      error instanceof ServiceCommercePolicyError ||
      error instanceof CommerceQuoteReviewBudgetError
    )
      return unavailable
    // Driver/storage/programming failures are not ordinary source unavailability.
    throw error
  }
  try {
    const review = project(saved)
    const d = saved.review.review.details
    const observations = generalBookingReviewObservationsSchema.parse({
      asOf: saved.review.asOf,
      observedHoldExpiresAt:
        "observedExpiresAt" in d.effects
          ? date(d.effects.observedExpiresAt)
          : null,
    })
    // Mapping a large full graph must not resurrect an approval past its expiry.
    if (saved.row.expiresAt.getTime() <= Date.now())
      throw Error("Expired review")
    const r = saved.row
    return {
      kind: "complete" as const,
      review,
      observations,
      privateBinding: {
        canonicalTarget: {
          id: saved.review.target.id,
          revision: saved.review.target.revision,
        },
        row: {
          id: r.id,
          actorUserId: r.actorUserId,
          tenantId: r.tenantId,
          storeId: r.storeId,
          conversationId: r.conversationId,
          action: r.action,
          actionVersion: r.actionVersion,
          revision: r.revision,
          roleSnapshot: r.roleSnapshot,
          idempotencyKey: r.idempotencyKey,
          payloadHash: r.payloadHash,
          targetRecordId: r.targetRecordId,
          targetRevision: r.targetRevision,
          approvalTokenHash: r.approvalTokenHash,
          expiresAt: date(r.expiresAt),
          createdAt: date(r.createdAt),
          updatedAt: date(r.updatedAt),
          status: r.status,
          executedResult: r.executedResult,
          errorCode: r.errorCode,
          decidedAt: r.decidedAt === null ? null : date(r.decidedAt),
        },
      },
    }
  } catch {
    // No parent/error/private metadata or partial review escapes on any refusal.
    return unavailable
  }
}
export type GeneralBookingAppReviewResult = Awaited<
  ReturnType<typeof readGeneralBookingAppReviewInTransaction>
>
export type CompleteGeneralBookingAppReview = Extract<
  GeneralBookingAppReviewResult,
  { kind: "complete" }
>
export type GeneralBookingAppReviewPrivateBinding =
  CompleteGeneralBookingAppReview["privateBinding"]
