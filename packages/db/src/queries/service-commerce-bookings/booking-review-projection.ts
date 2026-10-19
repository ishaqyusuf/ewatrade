import {
  assertServiceCommerceBookingTransition,
  projectServiceCommerceBookingCancellationConsequence,
} from "@ewatrade/service-commerce"
import { isCommercialOrderFulfillmentAllowed } from "../commercial-order-completion"
import { readBookingContactBasisInTransaction } from "./booking-command-contacts"
import {
  bookingConfirmationCommandHash,
  bookingHoldCommandHash,
  bookingRevisionCommandHash,
} from "./booking-command-inputs"
import type { StaffServiceCommerceBookingReviewInput } from "./booking-command-review"
import { notifications, order, slot, source } from "./booking-review-facts"
import {
  digest,
  refuse,
  revision,
  sameScope,
  stable,
  status,
} from "./booking-review-shared"
import { workReview } from "./booking-review-work"
import { resolvePaymentSnapshot } from "./lifecycle"
import type { BookingTransaction } from "./shared"

export async function reviewBookingCommandDetails(
  tx: BookingTransaction,
  command: StaffServiceCommerceBookingReviewInput,
  now: Date,
) {
  if (command.kind === "hold") {
    const input = command.input
    const currentSource = await source(
      tx,
      { tenantId: input.tenantId, storeId: input.storeId },
      input.source.id,
      true,
    )
    const config = await tx.serviceBookingOfferingConfig.findFirst({
      where: {
        offeringId: input.offeringId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        revision: input.expectedConfigurationRevision,
        status: "ACTIVE",
      },
      select: { id: true },
    })
    if (!config) refuse()
    const currentSlot = await slot(
      tx,
      input,
      config.id,
      input.resourceId,
      input.slotStartAt,
      input.slotEndAt,
      input.quantity,
      now,
    )
    if (
      currentSlot.config.revision !== input.expectedConfigurationRevision ||
      currentSlot.config.offeringId !== input.offeringId
    )
      refuse()
    const expiry = Math.min(
      input.slotStartAt.getTime() - 1,
      now.getTime() + currentSlot.config.holdDurationMinutes * 60_000,
    )
    const details = {
      source: currentSource,
      before: null,
      slot: currentSlot,
      effects: {
        kind: "hold",
        quantity: input.quantity,
        source: input.source,
        offeringId: input.offeringId,
        resourceId: input.resourceId,
        startAt: input.slotStartAt,
        endAt: input.slotEndAt,
        expiryRule: {
          beforeSlotMilliseconds: 1,
          holdDurationMinutes: currentSlot.config.holdDurationMinutes,
        },
        observedExpiresAt: new Date(expiry),
        reservation: "temporary_hold",
        bookingCreated: false,
        payment: "not_checked",
        notification: "none",
        capability: "private_confirm_created",
      },
    }
    return {
      details,
      targetId: input.source.id,
      commandHash: bookingHoldCommandHash(input),
    }
  }
  if (command.kind === "confirm") {
    const input = command.input
    const currentSource = await source(
      tx,
      { tenantId: input.tenantId, storeId: input.storeId },
      input.source.id,
      true,
    )
    const hold = await tx.serviceBookingHold.findFirst({
      where: {
        id: input.holdId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        sourceId: input.source.id,
        sourceType: "SERVICE_REQUEST",
        status: "HELD",
        expiresAt: { gt: now },
      },
      include: { offeringConfig: true },
    })
    if (
      !hold ||
      hold.id !== input.holdId ||
      hold.sourceId !== input.source.id ||
      hold.sourceType !== "SERVICE_REQUEST" ||
      hold.status !== "HELD" ||
      hold.expiresAt <= now
    )
      refuse()
    sameScope(hold, input)
    if (
      hold.offeringConfig.revision !== hold.bookingPolicyRevision ||
      hold.offeringConfig.status !== "ACTIVE"
    )
      refuse()
    const currentSlot = await slot(
      tx,
      input,
      hold.offeringConfigId,
      hold.resourceId,
      hold.startAt,
      hold.endAt,
      hold.capacity,
      now,
      { excludeHoldId: hold.id },
    )
    const currentOrder = await order(tx, input, input.commercialOrderId)
    const quoteVersion = input.quoteVersionId
      ? await tx.commerceQuoteVersion.findFirst({
          where: {
            id: input.quoteVersionId,
            status: "ACCEPTED",
            quote: {
              sourceId: input.source.id,
              sourceType: "SERVICE_REQUEST",
              tenantId: input.tenantId,
              storeId: input.storeId,
            },
          },
          select: {
            id: true,
            quoteId: true,
            version: true,
            status: true,
            currencyCode: true,
            totalMinor: true,
            expiresAt: true,
            acceptedOrderId: true,
            quote: {
              select: {
                id: true,
                sourceId: true,
                sourceType: true,
                tenantId: true,
                storeId: true,
                currentVersionId: true,
              },
            },
          },
        })
      : null
    if (
      input.quoteVersionId &&
      (!quoteVersion ||
        quoteVersion.id !== input.quoteVersionId ||
        quoteVersion.quoteId !== quoteVersion.quote.id ||
        quoteVersion.quote.sourceId !== input.source.id ||
        quoteVersion.quote.sourceType !== "SERVICE_REQUEST")
    )
      refuse()
    if (quoteVersion) sameScope(quoteVersion.quote, input)
    const payment = await resolvePaymentSnapshot(tx, {
      ...input,
      config: hold.offeringConfig,
      sourceId: input.source.id,
    })
    const job = input.serviceJobId
      ? await tx.serviceJob.findFirst({
          where: {
            id: input.serviceJobId,
            tenantId: input.tenantId,
            storeId: input.storeId,
          },
          select: { id: true, commercialOrderId: true, revision: true },
        })
      : null
    if (
      input.serviceJobId &&
      (!job ||
        !input.commercialOrderId ||
        job.commercialOrderId !== input.commercialOrderId)
    )
      refuse()
    const contact = await readBookingContactBasisInTransaction(tx, input)
    const notification = await notifications(
      tx,
      input,
      contact.contactOptIn && Boolean(contact.phone),
      contact.channelOrigin === "WHATSAPP"
        ? "WHATSAPP"
        : contact.channelOrigin === "STAFF"
          ? "STAFF"
          : "WEB",
      true,
    )
    const details = {
      source: currentSource,
      before: {
        holdId: hold.id,
        status: hold.status,
        sourceId: hold.sourceId,
        resourceId: hold.resourceId,
        startAt: hold.startAt,
        endAt: hold.endAt,
        expiresAt: hold.expiresAt,
        quantity: hold.capacity,
        configurationRevision: hold.bookingPolicyRevision,
      },
      slot: currentSlot,
      payment,
      quoteVersion,
      order: currentOrder,
      job,
      contactBasisDigest: digest(stable(contact)),
      effects: {
        kind: "confirm",
        status: "confirmed",
        revision: 0,
        consumesHoldId: hold.id,
        capability: "rotate_confirm_create_private_manage",
        notification,
        reminderLeadMinutes: currentSlot.settings.reminderLeadMinutes,
        paymentCollected: false,
        providerSettlement: "not_checked",
      },
    }
    return {
      details,
      targetId: input.holdId,
      commandHash: bookingConfirmationCommandHash(input),
    }
  }
  {
    const input = command.input
    const booking = await tx.serviceBooking.findFirst({
      where: {
        id: input.bookingId,
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
      include: { offeringConfig: true },
    })
    if (
      !booking ||
      booking.id !== input.bookingId ||
      booking.sourceType !== "SERVICE_REQUEST" ||
      booking.revision !== input.expectedRevision
    )
      refuse()
    sameScope(booking, input)
    revision(booking.revision)
    const currentSource = await source(
      tx,
      { tenantId: input.tenantId, storeId: input.storeId },
      booking.sourceId,
      false,
    )
    const currentStatus = status(booking.status)
    const nextStatus =
      input.operation === "reschedule"
        ? currentStatus
        : input.operation === "arrive"
          ? "arrived"
          : input.operation === "start"
            ? "in_service"
            : input.operation === "complete"
              ? "completed"
              : input.operation === "cancel"
                ? "cancelled"
                : "no_show"
    if (input.operation === "reschedule" && currentStatus !== "confirmed")
      refuse()
    if (nextStatus !== currentStatus)
      assertServiceCommerceBookingTransition(currentStatus, nextStatus)
    const currentOrder = await order(tx, input, booking.commercialOrderId)
    if (
      (input.operation === "start" || input.operation === "complete") &&
      currentOrder &&
      !isCommercialOrderFulfillmentAllowed(currentOrder.status)
    )
      refuse("This Order cannot progress in its current state.")
    let currentSlot: Awaited<ReturnType<typeof slot>> | null = null
    if (input.operation === "reschedule") {
      if (!input.resourceId || !input.newSlotStartAt || !input.newSlotEndAt)
        refuse()
      currentSlot = await slot(
        tx,
        input,
        booking.offeringConfigId,
        input.resourceId,
        input.newSlotStartAt,
        input.newSlotEndAt,
        booking.capacity,
        now,
        { excludeBookingId: booking.id },
      )
    }
    const cancellation = await (async () => {
      if (input.operation !== "cancel") return null
      const totals = booking.commercialOrderId
        ? await tx.commercialOrderPayment.groupBy({
            by: ["type"],
            _sum: { amountMinor: true },
            where: {
              orderId: booking.commercialOrderId,
              tenantId: input.tenantId,
              storeId: input.storeId,
              type: { in: ["PAYMENT", "REFUND"] },
            },
          })
        : []
      const netPaidMinor = totals.reduce(
        (n, row) =>
          n + (row.type === "REFUND" ? -1 : 1) * (row._sum.amountMinor ?? 0),
        0,
      )
      const cancellationAllowed =
        now.getTime() <=
        booking.startAt.getTime() - booking.cancellationWindowSnapshot * 60_000
      return {
        totals,
        netPaidMinor,
        cancellationAllowed,
        consequence: projectServiceCommerceBookingCancellationConsequence({
          bookingId: booking.id,
          stateRevision: booking.revision + 1,
          cancellationAllowed,
          policy:
            booking.refundPolicySnapshot === "FULL_BEFORE_CUTOFF"
              ? "full_before_cutoff"
              : booking.refundPolicySnapshot === "MANUAL_REVIEW"
                ? "manual_review"
                : "none",
          refundableAmountMinor: Math.min(
            Math.max(0, netPaidMinor),
            booking.requiredPaymentMinorSnapshot,
          ),
        }),
        refundExecuted: false,
      }
    })()
    let work: Awaited<ReturnType<typeof workReview>> | null = null
    if (
      (input.operation === "start" || input.operation === "complete") &&
      booking.serviceJobId
    )
      work = await workReview(
        tx,
        input,
        booking.serviceJobId,
        booking.commercialOrderId,
        input.operation,
        now,
      )
    const reminders =
      input.operation === "cancel" || input.operation === "reschedule"
        ? await tx.serviceBookingNotificationIntent.findMany({
            where: {
              bookingId: booking.id,
              tenantId: input.tenantId,
              storeId: input.storeId,
              status: "PENDING",
              type: "REMINDER",
            },
            select: {
              id: true,
              bookingId: true,
              status: true,
              type: true,
              scheduledFor: true,
              recipientCiphertext: true,
              authorizationUserId: true,
            },
          })
        : []
    const notification =
      input.operation === "cancel" || input.operation === "reschedule"
        ? await notifications(
            tx,
            input,
            Boolean(
              booking.customerContactCiphertext &&
                booking.notificationChannelSnapshot &&
                booking.notificationPolicyChannelSnapshot,
            ),
            booking.notificationPolicyChannelSnapshot ?? "STAFF",
            false,
          )
        : null
    const details = {
      source: currentSource,
      before: {
        id: booking.id,
        revision: booking.revision,
        status: currentStatus,
        sourceId: booking.sourceId,
        offeringId: booking.offeringConfig.offeringId,
        resourceId: booking.resourceId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        quantity: booking.capacity,
        timezone: booking.timezoneSnapshot,
        links: {
          holdId: booking.holdId,
          quoteVersionId: booking.quoteVersionId,
          commercialOrderId: booking.commercialOrderId,
          serviceJobId: booking.serviceJobId,
        },
        savedPolicy: {
          offering: booking.offeringPolicyRevisionSnapshot,
          payment: booking.paymentPolicyRevisionSnapshot,
          cancellation: booking.cancellationPolicyRevisionSnapshot,
          paymentRequirement: booking.paymentRequirementSnapshot,
          currency: booking.currencyCodeSnapshot,
          payable: booking.payableAmountMinorSnapshot,
          required: booking.requiredPaymentMinorSnapshot,
          deposit: booking.depositAmountMinorSnapshot,
          paymentStatus: booking.paymentStatus,
          cancellationWindow: booking.cancellationWindowSnapshot,
          refundPolicy: booking.refundPolicySnapshot,
          reminderLeadMinutes: booking.reminderLeadMinutesSnapshot,
        },
        notificationSnapshot: {
          recipientDigest: booking.customerContactCiphertext
            ? digest(booking.customerContactCiphertext)
            : null,
          channel: booking.notificationChannelSnapshot,
          policyChannel: booking.notificationPolicyChannelSnapshot,
        },
        milestones: {
          confirmedAt: booking.confirmedAt,
          arrivedAt: booking.arrivedAt,
          serviceStartedAt: booking.serviceStartedAt,
          completedAt: booking.completedAt,
          cancelledAt: booking.cancelledAt,
          noShowAt: booking.noShowAt,
        },
      },
      order: currentOrder,
      slot: currentSlot,
      cancellation,
      work,
      effects: {
        kind: input.operation,
        status: nextStatus,
        revision: booking.revision + 1,
        resourceId:
          input.operation === "reschedule"
            ? input.resourceId
            : booking.resourceId,
        startAt:
          input.operation === "reschedule"
            ? input.newSlotStartAt
            : booking.startAt,
        endAt:
          input.operation === "reschedule" ? input.newSlotEndAt : booking.endAt,
        reasonCode: input.reasonCode?.trim() ?? null,
        capability: ["cancelled", "completed", "no_show"].includes(nextStatus)
          ? "revoke_private_manage"
          : "rotate_private_manage",
        notification,
        pendingReminders: reminders
          .map(({ recipientCiphertext, ...row }) => ({
            ...row,
            recipientDigest: digest(recipientCiphertext),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        cancelPendingReminders:
          input.operation === "cancel" || input.operation === "reschedule",
        reminderLeadMinutes:
          input.operation === "reschedule"
            ? booking.reminderLeadMinutesSnapshot
            : null,
        paymentCollected: false,
        providerSettlement: "not_checked",
      },
    }
    return {
      details,
      targetId: input.bookingId,
      commandHash: bookingRevisionCommandHash(input),
    }
  }
}
