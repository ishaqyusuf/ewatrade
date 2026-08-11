import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  ServiceBookingEventType,
  ServiceBookingNotificationType,
  ServiceBookingPolicy,
  ServiceWorkPolicy,
} from "../../../../generated/prisma/enums"
import { recordCommercialOrderPayment } from "../../commercial-payments"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  confirmServiceCommerceBooking,
  createServiceCommerceBookingCapability,
  createServiceCommerceBookingHold,
  createServiceCommerceBookingResource,
  getPublicServiceCommerceBooking,
  getPublicServiceCommerceBookingSlots,
  reviseServiceCommerceBooking,
  updateServiceCommerceBookingConfiguration,
} from "../../service-commerce-bookings"
import {
  acceptServiceQuote,
  createServiceRequestForm,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: true,
    delivery: false,
    intake: true,
    payment: true,
    pickup: false,
    progressive_catalog: false,
    quote: true,
    service_completion: true,
    staff: true,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "inventory_managed",
  procureToOrderEnabled: false,
}

function issueCapabilityToken(input: {
  clientOperationId: string
  purpose: "confirm" | "view_and_manage" | "view_slots"
  storeId: string
  tenantId: string
}) {
  return `booking-${input.purpose}-${input.clientOperationId}-${input.storeId}-${input.tenantId}`
}

setDefaultTimeout(180_000)

describeWithServiceCommerceDatabase(
  "Service Commerce appointment booking on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      await fixture.db.serviceOffering.update({
        data: {
          bookingPolicy: ServiceBookingPolicy.BOOKING_REQUIRED,
          workPolicy: ServiceWorkPolicy.TRACKED,
        },
        where: { offeringId: fixture.serviceOfferingId },
      })
      const profile = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Prepare appointment booking acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: profile.revision,
        reason: "Activate appointment booking acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("keeps public appointment holds scoped, capacity-safe, revisioned, and separate from payment", async () => {
      const runId = randomUUID()
      const now = new Date()
      const slotStartAt = new Date(now.getTime() + 2 * 86_400_000)
      slotStartAt.setUTCMinutes(0, 0, 0)
      slotStartAt.setUTCHours(10)
      const slotEndAt = new Date(slotStartAt.getTime() + 60 * 60_000)
      const rescheduledStartAt = new Date(
        slotStartAt.getTime() + 2 * 60 * 60_000,
      )
      const rescheduledEndAt = new Date(
        rescheduledStartAt.getTime() + 60 * 60_000,
      )
      const source = { id: "", kind: "service" as const }

      const resource = await createServiceCommerceBookingResource(fixture.db, {
        actorUserId: fixture.actorUserId,
        capacity: 1,
        clientOperationId: `booking-resource-${runId}`,
        kind: "room",
        name: "Acceptance Consultation Room",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const configuration = await updateServiceCommerceBookingConfiguration(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          availabilityRules: [
            {
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              endLocalTime: "18:00",
              id: `booking-hours-${runId}`,
              startLocalTime: "08:00",
            },
          ],
          bookingHorizonMinutes: 43_200,
          cancellationPolicy: {
            allowedUntilMinutesBeforeStart: 60,
            refundPolicy: "full_before_cutoff",
            revision: 7,
          },
          clientOperationId: `booking-config-${runId}`,
          exceptions: [],
          expectedRevision: 0,
          holdDurationMinutes: 5,
          leadTimeMinutes: 0,
          offeringId: fixture.serviceOfferingId,
          paymentPolicy: {
            depositMinor: 2_500,
            requirement: "deposit",
            revision: 3,
          },
          reminderLeadMinutes: 1_440,
          resources: [{ capacity: 1, id: resource.id, label: resource.name }],
          slotDurationMinutes: 60,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          timezone: "Africa/Lagos",
        },
      )
      const persistedConfiguration =
        await fixture.db.serviceBookingOfferingConfig.findFirstOrThrow({
          include: {
            resources: true,
            store: { include: { serviceBookingSettings: true } },
          },
          where: {
            offeringId: fixture.serviceOfferingId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        })
      expect(persistedConfiguration).toMatchObject({
        capacity: 1,
        durationMinutes: 60,
        holdDurationMinutes: 5,
        leadTimeMinutes: 0,
        paymentRequirement: "DEPOSIT",
        store: { serviceBookingSettings: { timezone: "Africa/Lagos" } },
      })
      expect(persistedConfiguration.resources).toEqual([
        expect.objectContaining({ resourceId: resource.id }),
      ])
      expect(
        await fixture.db.serviceBookingAvailabilityRule.count({
          where: {
            resourceId: resource.id,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(7)

      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Appointment booking acceptance form",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const request = await submitPublicServiceRequest(fixture.db, {
        clientRequestId: `booking-request-${runId}`,
        consent: {
          contactOptIn: true,
          privacyNoticeVersion: "booking-acceptance-v1",
        },
        customerName: "Appointment Customer",
        customerPhone: "+2348333333333",
        details: "Please book the earliest available consultation.",
        formToken: form.token,
        lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
      })
      source.id = request.id
      const quote = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `booking-quote-${runId}`,
        clientVersionId: `booking-version-${runId}`,
        lines: [
          {
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
            unitPriceMinor: 7_500,
          },
        ],
        requestId: request.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!quote.token) throw new Error("Booking Quote token was not issued.")
      const accepted = await acceptServiceQuote(fixture.db, {
        acceptanceToken: quote.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `booking-acceptance-${runId}`,
      })
      if (!accepted.jobId)
        throw new Error("Tracked Service Job was not created.")

      const capability = await createServiceCommerceBookingCapability(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `booking-capability-${runId}`,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          issueCapabilityToken,
          now,
          offeringId: fixture.serviceOfferingId,
          source,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const slots = await getPublicServiceCommerceBookingSlots(fixture.db, {
        accessToken: capability.accessToken,
        from: new Date(slotStartAt.getTime() - 60 * 60_000),
        now,
        to: new Date(slotEndAt.getTime() + 60 * 60_000),
      })
      expect(slots).toMatchObject({
        configurationRevision: configuration.revision,
        offeringId: fixture.serviceOfferingId,
        timezone: "Africa/Lagos",
      })
      expect(slots.slots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endAt: slotEndAt,
            remainingCapacity: 1,
            resourceId: resource.id,
            startAt: slotStartAt,
          }),
        ]),
      )

      const holdInput = (clientOperationId: string, holdNow = now) => ({
        accessToken: capability.accessToken,
        clientOperationId,
        expectedConfigurationRevision: configuration.revision,
        issueCapabilityToken,
        now: holdNow,
        offeringId: fixture.serviceOfferingId,
        quantity: 1,
        resourceId: resource.id,
        slotEndAt,
        slotStartAt,
        source,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const contenderOperationIds = [
        `booking-hold-a-${runId}`,
        `booking-hold-b-${runId}`,
      ] as const
      const contenders = await Promise.allSettled([
        createServiceCommerceBookingHold(
          fixture.db,
          holdInput(contenderOperationIds[0]),
        ),
        createServiceCommerceBookingHold(
          fixture.db,
          holdInput(contenderOperationIds[1]),
        ),
      ])
      const winnerIndex = contenders.findIndex(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof createServiceCommerceBookingHold>>
        > => result.status === "fulfilled",
      )
      const winner = contenders[winnerIndex]
      const winnerOperationId = contenderOperationIds[winnerIndex]
      const loser = contenders.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )
      if (
        !winner ||
        winner.status !== "fulfilled" ||
        !winnerOperationId ||
        winnerIndex < 0
      ) {
        throw new Error("One concurrent booking hold should have succeeded.")
      }
      expect(winner.value.status).toBe("held")
      expect(loser?.reason).toMatchObject({ code: "BOOKING_CAPACITY_CONFLICT" })
      await expect(
        createServiceCommerceBookingHold(
          fixture.db,
          holdInput(winnerOperationId),
        ),
      ).resolves.toMatchObject({ id: winner.value.id })

      const afterFirstHold = new Date(now.getTime() + 6 * 60_000)
      const expiredHold = await createServiceCommerceBookingHold(
        fixture.db,
        holdInput(`booking-hold-expired-${runId}`, afterFirstHold),
      )
      await expect(
        confirmServiceCommerceBooking(fixture.db, {
          accessToken: expiredHold.accessToken ?? "expired-hold-token",
          clientOperationId: `booking-expired-confirm-${runId}`,
          holdId: expiredHold.id,
          issueCapabilityToken,
          now: new Date(afterFirstHold.getTime() + 6 * 60_000),
          protectRecipient: (value) => `protected:${value}`,
          source,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })

      const confirmationNow = new Date(afterFirstHold.getTime() + 6 * 60_000)
      const confirmationHold = await createServiceCommerceBookingHold(
        fixture.db,
        holdInput(`booking-hold-confirm-${runId}`, confirmationNow),
      )
      const confirmed = await confirmServiceCommerceBooking(fixture.db, {
        accessToken: confirmationHold.accessToken ?? "confirmation-hold-token",
        clientOperationId: `booking-confirm-${runId}`,
        commercialOrderId: accepted.orderId,
        holdId: confirmationHold.id,
        issueCapabilityToken,
        now: confirmationNow,
        protectRecipient: (value) => `protected:${value}`,
        quoteVersionId: quote.versionId,
        serviceJobId: accepted.jobId,
        source,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(confirmed).toMatchObject({
        paymentStatus: "pending",
        status: "confirmed",
        timezone: "Africa/Lagos",
      })
      await expect(
        confirmServiceCommerceBooking(fixture.db, {
          accessToken:
            confirmationHold.accessToken ?? "confirmation-hold-token",
          clientOperationId: `booking-confirm-${runId}`,
          commercialOrderId: accepted.orderId,
          holdId: confirmationHold.id,
          issueCapabilityToken,
          now: confirmationNow,
          protectRecipient: (value) => `protected:${value}`,
          quoteVersionId: quote.versionId,
          serviceJobId: accepted.jobId,
          source,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).resolves.toMatchObject({ id: confirmed.id })

      const booking = await fixture.db.serviceBooking.findUniqueOrThrow({
        where: { id: confirmed.id },
      })
      expect(booking).toMatchObject({
        cancellationPolicyRevisionSnapshot: 0,
        cancellationWindowSnapshot: 60,
        commercialOrderId: accepted.orderId,
        depositAmountMinorSnapshot: 2_500,
        paymentPolicyRevisionSnapshot: 0,
        paymentRequirementSnapshot: "DEPOSIT",
        paymentStatus: "PENDING",
        payableAmountMinorSnapshot: 7_500,
        quoteVersionId: quote.versionId,
        refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
        requiredPaymentMinorSnapshot: 2_500,
        serviceJobId: accepted.jobId,
        sourceId: request.id,
        sourceType: "SERVICE_REQUEST",
      })
      expect(
        await fixture.db.commercialOrderPayment.count({
          where: { orderId: accepted.orderId },
        }),
      ).toBe(0)
      await expect(
        getPublicServiceCommerceBooking(fixture.db, {
          accessToken: confirmed.accessToken ?? "booking-manage-token",
          now: confirmationNow,
        }),
      ).resolves.toMatchObject({ id: confirmed.id, status: "confirmed" })

      await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 2_500,
        clientPaymentId: `booking-deposit-${runId}`,
        method: "card",
        orderId: accepted.orderId,
        tenantId: fixture.tenantId,
      })
      expect(
        await fixture.db.serviceBooking.findUniqueOrThrow({
          where: { id: confirmed.id },
        }),
      ).toMatchObject({ paymentStatus: "PAID", status: "CONFIRMED" })

      const rescheduled = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: confirmed.id,
        clientOperationId: `booking-reschedule-${runId}`,
        expectedRevision: 0,
        issueCapabilityToken,
        newSlotEndAt: rescheduledEndAt,
        newSlotStartAt: rescheduledStartAt,
        now: confirmationNow,
        operation: "reschedule",
        reasonCode: "customer_requested_new_time",
        resourceId: resource.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(rescheduled).toMatchObject({
        revision: 1,
        startAt: rescheduledStartAt,
        status: "confirmed",
      })
      await expect(
        getPublicServiceCommerceBooking(fixture.db, {
          accessToken: confirmed.accessToken ?? "stale-booking-manage-token",
          now: confirmationNow,
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })

      const cancelled = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: confirmed.id,
        clientOperationId: `booking-cancel-${runId}`,
        expectedRevision: 1,
        issueCapabilityToken,
        now: confirmationNow,
        operation: "cancel",
        reasonCode: "customer_cancelled_before_cutoff",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(cancelled.refund).toEqual({ amountMinor: 2_500, outcome: "full" })
      const [events, notificationIntents, refundCount] = await Promise.all([
        fixture.db.serviceBookingEvent.findMany({
          orderBy: { createdAt: "asc" },
          where: { bookingId: confirmed.id },
        }),
        fixture.db.serviceBookingNotificationIntent.findMany({
          where: { bookingId: confirmed.id },
        }),
        fixture.db.commercialOrderPayment.count({
          where: { orderId: accepted.orderId, type: "REFUND" },
        }),
      ])
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: ServiceBookingEventType.CONFIRMED }),
          expect.objectContaining({
            reasonCode: "customer_requested_new_time",
            type: ServiceBookingEventType.RESCHEDULED,
          }),
          expect.objectContaining({
            reasonCode: "customer_cancelled_before_cutoff",
            refundAmountMinor: 2_500,
            refundOutcome: "REFUND_ELIGIBLE",
            type: ServiceBookingEventType.CANCELLED,
          }),
        ]),
      )
      expect(notificationIntents.map((intent) => intent.type)).toEqual(
        expect.arrayContaining([
          ServiceBookingNotificationType.CONFIRMATION,
          ServiceBookingNotificationType.REMINDER,
          ServiceBookingNotificationType.RESCHEDULE,
          ServiceBookingNotificationType.CANCELLATION,
        ]),
      )
      expect(notificationIntents.every((intent) => Boolean(intent.id))).toBe(
        true,
      )
      expect(refundCount).toBe(0)

      const dstNow = new Date("2027-03-14T04:30:00.000Z")
      await updateServiceCommerceBookingConfiguration(fixture.db, {
        actorUserId: fixture.actorUserId,
        availabilityRules: [
          {
            daysOfWeek: [0],
            endLocalTime: "04:00",
            id: `booking-dst-hours-${runId}`,
            startLocalTime: "00:00",
          },
        ],
        bookingHorizonMinutes: 43_200,
        cancellationPolicy: {
          allowedUntilMinutesBeforeStart: 60,
          refundPolicy: "full_before_cutoff",
          revision: 7,
        },
        clientOperationId: `booking-dst-config-${runId}`,
        exceptions: [],
        expectedRevision: configuration.revision,
        holdDurationMinutes: 5,
        leadTimeMinutes: 0,
        offeringId: fixture.serviceOfferingId,
        paymentPolicy: {
          depositMinor: 2_500,
          requirement: "deposit",
          revision: 3,
        },
        reminderLeadMinutes: 1_440,
        resources: [{ capacity: 1, id: resource.id, label: resource.name }],
        slotDurationMinutes: 60,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        timezone: "America/New_York",
      })
      await expect(
        getPublicServiceCommerceBookingSlots(fixture.db, {
          accessToken: capability.accessToken,
          from: new Date(slotStartAt.getTime() - 60 * 60_000),
          now: confirmationNow,
          to: new Date(slotEndAt.getTime() + 60 * 60_000),
        }),
      ).rejects.toMatchObject({ code: "BOOKING_CONFIGURATION_CONFLICT" })
      const dstCapability = await createServiceCommerceBookingCapability(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `booking-dst-capability-${runId}`,
          expiresAt: new Date(dstNow.getTime() + 24 * 60 * 60_000),
          issueCapabilityToken,
          now: dstNow,
          offeringId: fixture.serviceOfferingId,
          source,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const dstSlots = await getPublicServiceCommerceBookingSlots(fixture.db, {
        accessToken: dstCapability.accessToken,
        from: new Date("2027-03-14T05:00:00.000Z"),
        now: dstNow,
        to: new Date("2027-03-14T09:00:00.000Z"),
      })
      const dstHours = dstSlots.slots.map((slot) =>
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          hour12: false,
          hourCycle: "h23",
          timeZone: "America/New_York",
        }).format(slot.startAt),
      )
      expect(dstSlots.timezone).toBe("America/New_York")
      expect(dstHours).toContain("03")
      expect(dstHours).not.toContain("02")

      await expect(
        createServiceCommerceBookingHold(fixture.db, {
          ...holdInput(`booking-cross-store-${runId}`, confirmationNow),
          storeId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
      await expect(
        createServiceCommerceBookingHold(fixture.db, {
          ...holdInput(`booking-cross-tenant-${runId}`, confirmationNow),
          tenantId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
      await expect(
        getPublicServiceCommerceBookingSlots(fixture.db, {
          accessToken: capability.accessToken,
          from: slotStartAt,
          now: new Date(now.getTime() + 2 * 60 * 60_000),
          to: slotEndAt,
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
    }, 240_000)
  },
)
