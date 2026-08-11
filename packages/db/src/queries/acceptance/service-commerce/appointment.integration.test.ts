import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  ServiceBookingNotificationStatus,
  ServiceBookingNotificationType,
  ServiceBookingPolicy,
  ServiceWorkPolicy,
} from "../../../../generated/prisma/enums"
import { approveCommerceQuoteVersion } from "../../commerce-quotes"
import { recordCommercialOrderPayment } from "../../commercial-payments"
import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  claimServiceCommerceBookingNotificationIntent,
  completeServiceCommerceBookingNotificationIntent,
  confirmServiceCommerceBooking,
  createServiceCommerceBookingCapability,
  createServiceCommerceBookingHold,
  createServiceCommerceBookingResource,
  failServiceCommerceBookingNotificationIntent,
  getPublicServiceCommerceBooking,
  getPublicServiceCommerceBookingSlots,
  reviseServiceCommerceBooking,
  updateServiceCommerceBookingConfiguration,
} from "../../service-commerce-bookings"
import {
  createServiceCommerceCatalogDraft,
  getServiceCommerceCatalogPricePromotionImpact,
  promoteServiceCommerceCatalogPrice,
} from "../../service-commerce-catalog"
import { getServiceCommerceCatalogPriceSuggestions } from "../../service-commerce-catalog-pricing"
import { resolveServiceCommerceCatalogSourceLine } from "../../service-commerce-catalog-source"
import {
  getServiceCommerceCatalogGraduationReadiness,
  graduateServiceCommerceCatalogOffering,
  publishServiceCommerceCatalogOffering,
} from "../../service-commerce-graduation"
import { submitServiceCommerceIntake } from "../../service-commerce-intake"
import {
  getServiceCommerceQuoteReleaseSettings,
  listPendingServiceCommerceQuoteApprovals,
  updateServiceCommerceQuoteReleaseSettings,
} from "../../service-commerce-quote-release"
import { getServiceCommerceCustomerRequestProjection } from "../../service-commerce-sources"
import {
  acceptServiceQuote,
  createServiceRequestForm,
  getPublicServiceQuote,
  issueServiceQuote,
  listServiceRequests,
} from "../../service-public"
import {
  exportServiceOperationsAudit,
  getServiceOperationsReport,
} from "../../service-reporting"
import {
  type AppointmentAcceptanceFixture,
  createAppointmentAcceptanceFixture,
  disposeAppointmentAcceptanceFixture,
} from "./appointment.fixture"
import { describeWithServiceCommerceDatabase } from "./database"

const appointmentSettings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: true,
    delivery: false,
    intake: true,
    payment: true,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: true,
    staff: true,
    web: true,
    whatsapp: true,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: true,
}

function issueCapabilityToken(input: {
  clientOperationId: string
  purpose: "confirm" | "view_and_manage" | "view_slots"
  storeId: string
  tenantId: string
}) {
  return `appointment-${input.purpose}-${input.clientOperationId}-${input.storeId}-${input.tenantId}`
}

setDefaultTimeout(720_000)

describeWithServiceCommerceDatabase(
  "Appointment vertical acceptance on Neon",
  () => {
    let entryToken: string
    let fixture: AppointmentAcceptanceFixture
    let formToken: string

    beforeAll(async () => {
      fixture = await createAppointmentAcceptanceFixture()
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
        reason: "Appointment acceptance profile",
        settings: appointmentSettings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: profile.revision,
        reason: "Activate appointment acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const entry = await publishCustomerEntryPoint(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      entryToken = entry.publicToken
      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Appointment consultation request",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      formToken = form.token
    })

    afterAll(async () => {
      if (fixture) await disposeAppointmentAcceptanceFixture(fixture)
    })

    test("proves appointment reuse across progressive catalog, governed quotes, and three channel lifecycles", async () => {
      const runId = randomUUID()
      const now = new Date()
      const sourceCountsBefore = await Promise.all([
        fixture.db.catalogProduct.count({
          where: { catalogItem: { tenantId: fixture.tenantId } },
        }),
        fixture.db.productUnitOffering.count({
          where: { tenantId: fixture.tenantId },
        }),
        fixture.db.stockBalanceSource.count({
          where: { tenantId: fixture.tenantId },
        }),
      ])
      const [profile, connection, binding] = await Promise.all([
        fixture.db.serviceCommerceStoreProfile.findFirstOrThrow({
          where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
        }),
        fixture.db.whatsAppConnection.findFirstOrThrow({
          where: { id: fixture.connectionId, tenantId: fixture.tenantId },
        }),
        fixture.db.whatsAppStoreBinding.findFirstOrThrow({
          where: {
            connectionId: fixture.connectionId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ])
      expect(profile).toMatchObject({
        attachmentsEnabled: false,
        bookingEnabled: true,
        paymentEnabled: true,
        progressiveCatalogEnabled: true,
        whatsappEnabled: true,
      })
      expect(connection).toMatchObject({
        billingOwner: "BUSINESS",
        status: "ACTIVE",
      })
      expect(binding.status).toBe("ACTIVE")

      const web = await submitServiceCommerceIntake(fixture.db, {
        envelope: {
          channel: "web",
          clientCommandId: `appointment-web-${runId}`,
          consent: {
            contactOptIn: true,
            privacyNoticeVersion: "appointment-acceptance-v1",
          },
          context: { kind: "entry_point", token: entryToken },
          intent: {
            customer: {
              email: `appointment-${runId}@example.invalid`,
              name: "Shared Appointment Customer",
              phone: "+2348444444444",
            },
            details:
              "I need a first-time natural-hair consultation before booking.",
            formToken,
            kind: "service",
            lines: [
              {
                details: "Natural-hair assessment and care-plan consultation",
                offeringId: fixture.serviceOfferingId,
                quantity: "1",
              },
            ],
          },
        },
      })
      const staff = await submitServiceCommerceIntake(fixture.db, {
        actorUserId: fixture.actorUserId,
        envelope: {
          channel: "staff",
          clientCommandId: `appointment-staff-${runId}`,
          consent: {
            contactOptIn: false,
            privacyNoticeVersion: "appointment-acceptance-v1",
          },
          context: { kind: "store", storeId: fixture.storeId },
          intent: {
            customer: {
              name: "Shared Appointment Customer",
              phone: "+2348444444444",
            },
            details: "Attendant-assisted follow-up appointment request.",
            formToken,
            kind: "service",
            lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
          },
        },
        tenantId: fixture.tenantId,
      })
      const providerEventId = `appointment-wamid-${runId}`
      const inbound = await fixture.db.whatsAppInboundEvent.create({
        data: {
          connectionId: fixture.connectionId,
          externalCustomerId: "+2348444444444",
          messageType: "text",
          normalizedPayload: {
            intakeKind: "service",
            text: "Can I book a consultation tomorrow?",
          },
          providerEventId,
          routeVertical: "SERVICE",
          status: "PROCESSING",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      const whatsapp = await submitServiceCommerceIntake(fixture.db, {
        envelope: {
          channel: "whatsapp",
          clientCommandId: `whatsapp:${providerEventId}`,
          consent: {
            contactOptIn: true,
            privacyNoticeVersion: "whatsapp-customer-initiated-v1",
          },
          context: { inboundEventId: inbound.id, kind: "inbound_event" },
          intent: {
            customer: {
              name: "Shared Appointment Customer",
              phone: "+2348444444444",
            },
            details: "WhatsApp appointment request.",
            formToken,
            kind: "service",
            lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
          },
          providerEventId,
        },
      })
      expect([web, staff, whatsapp]).toEqual([
        expect.objectContaining({
          channel: "web",
          source: { id: expect.any(String), kind: "service" },
          status: "accepted",
        }),
        expect.objectContaining({
          channel: "staff",
          source: { id: expect.any(String), kind: "service" },
          status: "accepted",
        }),
        expect.objectContaining({
          channel: "whatsapp",
          source: { id: expect.any(String), kind: "service" },
          status: "accepted",
        }),
      ])
      if (
        web.status !== "accepted" ||
        staff.status !== "accepted" ||
        whatsapp.status !== "accepted"
      ) {
        throw new Error("Appointment channel intake did not resolve.")
      }
      const channelOrigins = await fixture.db.serviceRequest.findMany({
        orderBy: { channelOrigin: "asc" },
        select: { channelOrigin: true, customerName: true },
        where: {
          id: { in: [web.source.id, staff.source.id, whatsapp.source.id] },
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      expect(
        channelOrigins.map((request) => request.channelOrigin).sort(),
      ).toEqual(["STAFF", "WEB", "WHATSAPP"])
      expect(
        channelOrigins.every(
          (request) => request.customerName === "Shared Appointment Customer",
        ),
      ).toBe(true)

      const webLine = await fixture.db.serviceRequestLine.findFirstOrThrow({
        where: { requestId: web.source.id },
      })
      const catalogScope = {
        actorUserId: fixture.actorUserId,
        source: { id: web.source.id, kind: "service" as const },
        sourceLineId: webLine.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const sourceLine = await resolveServiceCommerceCatalogSourceLine(
        fixture.db,
        { ...catalogScope, operation: "read" },
      )
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        ...catalogScope,
        clientOperationId: `appointment-draft-${runId}`,
        draftKind: "service",
        expectedSourceFingerprint: sourceLine.ref.fingerprint,
        name: "Natural-hair consultation",
        verifiedAlias: "Natural-hair assessment and care-plan consultation",
      })
      expect(draft.offering).toMatchObject({
        fixedPriceMinor: null,
        kind: "SERVICE",
        pricingPolicy: "QUOTE_REQUIRED",
        status: "DRAFT",
      })

      const directQuote = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `appointment-direct-quote-${runId}`,
        clientVersionId: `appointment-direct-version-${runId}`,
        lines: [
          {
            offeringId: draft.offering.id,
            quantity: "1",
            sourceLineId: webLine.id,
            unitPriceMinor: 8_500,
          },
        ],
        requestId: web.source.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(directQuote).toMatchObject({ releaseState: "released" })
      if (!directQuote.token)
        throw new Error("Attendant-released appointment Quote token missing.")
      const publicQuote = await getPublicServiceQuote(fixture.db, {
        acceptanceToken: directQuote.token,
      })
      expect(publicQuote).toMatchObject({
        accepted: false,
        payable: true,
        totalMinor: 8_500,
      })
      expect(JSON.stringify(publicQuote)).not.toContain("payloadHash")
      expect(JSON.stringify(publicQuote)).not.toContain("customerPhone")

      const impact = await getServiceCommerceCatalogPricePromotionImpact(
        fixture.db,
        {
          ...catalogScope,
          expectedSourceFingerprint: sourceLine.ref.fingerprint,
          quoteVersionId: directQuote.versionId,
        },
      )
      await promoteServiceCommerceCatalogPrice(fixture.db, {
        ...catalogScope,
        affectedStoreIds: impact.affectedStores.map((store) => store.id),
        clientOperationId: `appointment-price-${runId}`,
        expectedPreviousPriceMinor: null,
        expectedSourceFingerprint: sourceLine.ref.fingerprint,
        priceMinor: 8_500,
        quoteVersionId: directQuote.versionId,
        reason: "Promote the attributable attendant quotation",
      })
      const readiness = await getServiceCommerceCatalogGraduationReadiness(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          offeringId: draft.offering.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      expect(readiness).toMatchObject({
        draftKind: "service",
        isPublished: false,
      })
      expect(readiness.missingFacts).toEqual(["category", "service_duration"])
      const graduated = await graduateServiceCommerceCatalogOffering(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          authorizationPolicy: "on_order_confirmation",
          bookingPolicy: "booking_required",
          category: "Hair consultations",
          clientOperationId: `appointment-graduate-${runId}`,
          confirmed: true,
          currencyCode: "NGN",
          draftKind: "service",
          durationMinutes: 60,
          expectedOfferingRevision: readiness.revision,
          fixedPriceMinor: 8_500,
          guidance: "Review goals and agree a care plan before service.",
          offeringId: draft.offering.id,
          reason: "Complete the verified appointment Service configuration",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          variantName: "Standard consultation",
          workPolicy: "tracked",
        },
      )
      expect(graduated).toMatchObject({
        canGraduate: true,
        draftKind: "service",
        isPublished: false,
        offeringId: draft.offering.id,
      })
      const published = await publishServiceCommerceCatalogOffering(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `appointment-publish-${runId}`,
          confirmed: true,
          expectedOfferingRevision: graduated.revision,
          offeringId: draft.offering.id,
          reason: "Make the fully configured appointment Service bookable",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      expect(published.isPublished).toBe(true)
      expect(
        await Promise.all([
          fixture.db.catalogProduct.count({
            where: { catalogItem: { tenantId: fixture.tenantId } },
          }),
          fixture.db.productUnitOffering.count({
            where: { tenantId: fixture.tenantId },
          }),
          fixture.db.stockBalanceSource.count({
            where: { tenantId: fixture.tenantId },
          }),
        ]),
      ).toEqual(sourceCountsBefore)

      const directAcceptance = await acceptServiceQuote(fixture.db, {
        acceptanceToken: directQuote.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `appointment-direct-accept-${runId}`,
      })
      if (!directAcceptance.jobId)
        throw new Error("Tracked appointment Service Job missing.")
      const priceSuggestions = await getServiceCommerceCatalogPriceSuggestions(
        fixture.db,
        {
          ...catalogScope,
          includeTenantHistory: false,
          offeringId: draft.offering.id,
        },
      )
      expect(priceSuggestions.suggestion).toMatchObject({
        currencyCode: "NGN",
        priceMinor: 8_500,
        scope: "offering",
        source: "current_offering",
      })
      expect(priceSuggestions.evidence.map((item) => item.source)).toEqual(
        expect.arrayContaining(["current_offering", "accepted_quote"]),
      )

      const resource = await createServiceCommerceBookingResource(fixture.db, {
        actorUserId: fixture.actorUserId,
        capacity: 1,
        clientOperationId: `appointment-resource-${runId}`,
        kind: "staff",
        name: `Appointment Specialist ${runId}`,
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
              id: `appointment-hours-${runId}`,
              startLocalTime: "08:00",
            },
          ],
          bookingHorizonMinutes: 43_200,
          cancellationPolicy: {
            allowedUntilMinutesBeforeStart: 60,
            refundPolicy: "full_before_cutoff",
            revision: 1,
          },
          clientOperationId: `appointment-config-${runId}`,
          exceptions: [],
          expectedRevision: 0,
          holdDurationMinutes: 5,
          leadTimeMinutes: 0,
          offeringId: draft.offering.id,
          paymentPolicy: {
            depositMinor: 2_500,
            requirement: "deposit",
            revision: 1,
          },
          reminderLeadMinutes: 1_440,
          resources: [{ capacity: 1, id: resource.id, label: resource.name }],
          slotDurationMinutes: 60,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          timezone: "Africa/Lagos",
        },
      )
      const slotStartAt = new Date(now.getTime() + 2 * 86_400_000)
      slotStartAt.setUTCHours(10, 0, 0, 0)
      const slotEndAt = new Date(slotStartAt.getTime() + 60 * 60_000)
      const rescheduledStartAt = new Date(
        slotStartAt.getTime() + 2 * 60 * 60_000,
      )
      const rescheduledEndAt = new Date(
        rescheduledStartAt.getTime() + 60 * 60_000,
      )
      const directSource = { id: web.source.id, kind: "service" as const }
      const capability = await createServiceCommerceBookingCapability(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `appointment-capability-${runId}`,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          issueCapabilityToken,
          now,
          offeringId: draft.offering.id,
          source: directSource,
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
      expect(slots.slots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            remainingCapacity: 1,
            resourceId: resource.id,
            startAt: slotStartAt,
          }),
        ]),
      )
      const noSlotStartAt = new Date(slotStartAt)
      noSlotStartAt.setUTCHours(20)
      await expect(
        createServiceCommerceBookingHold(fixture.db, {
          accessToken: capability.accessToken,
          clientOperationId: `appointment-no-slot-${runId}`,
          expectedConfigurationRevision: configuration.revision,
          issueCapabilityToken,
          now,
          offeringId: draft.offering.id,
          quantity: 1,
          resourceId: resource.id,
          slotEndAt: new Date(noSlotStartAt.getTime() + 60 * 60_000),
          slotStartAt: noSlotStartAt,
          source: directSource,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toMatchObject({ code: "BOOKING_CAPACITY_CONFLICT" })
      const holdInput = (clientOperationId: string, holdNow = now) => ({
        accessToken: capability.accessToken,
        clientOperationId,
        expectedConfigurationRevision: configuration.revision,
        issueCapabilityToken,
        now: holdNow,
        offeringId: draft.offering.id,
        quantity: 1,
        resourceId: resource.id,
        slotEndAt,
        slotStartAt,
        source: directSource,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const contenders = await Promise.allSettled([
        createServiceCommerceBookingHold(
          fixture.db,
          holdInput(`appointment-contender-a-${runId}`),
        ),
        createServiceCommerceBookingHold(
          fixture.db,
          holdInput(`appointment-contender-b-${runId}`),
        ),
      ])
      expect(
        contenders.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        contenders.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "BOOKING_CAPACITY_CONFLICT" } })

      const confirmationNow = new Date(now.getTime() + 6 * 60_000)
      const confirmationHold = await createServiceCommerceBookingHold(
        fixture.db,
        holdInput(`appointment-confirm-hold-${runId}`, confirmationNow),
      )
      const confirmed = await confirmServiceCommerceBooking(fixture.db, {
        accessToken: confirmationHold.accessToken ?? "missing-hold-token",
        clientOperationId: `appointment-confirm-${runId}`,
        commercialOrderId: directAcceptance.orderId,
        holdId: confirmationHold.id,
        issueCapabilityToken,
        now: confirmationNow,
        protectRecipient: (value) => `protected:${value}`,
        quoteVersionId: directQuote.versionId,
        serviceJobId: directAcceptance.jobId,
        source: directSource,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(confirmed).toMatchObject({
        paymentStatus: "pending",
        status: "confirmed",
      })
      const safeBooking = await getPublicServiceCommerceBooking(fixture.db, {
        accessToken: confirmed.accessToken ?? "missing-manage-token",
        now: confirmationNow,
      })
      expect(safeBooking).toMatchObject({
        id: confirmed.id,
        paymentStatus: "pending",
        status: "confirmed",
      })
      expect(JSON.stringify(safeBooking)).not.toContain("recipientCiphertext")
      expect(JSON.stringify(safeBooking)).not.toContain("customerContact")
      await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 2_500,
        clientPaymentId: `appointment-deposit-${runId}`,
        method: "card",
        orderId: directAcceptance.orderId,
        tenantId: fixture.tenantId,
      })
      const confirmationIntent =
        await fixture.db.serviceBookingNotificationIntent.findFirstOrThrow({
          where: {
            bookingId: confirmed.id,
            type: ServiceBookingNotificationType.CONFIRMATION,
          },
        })
      await claimServiceCommerceBookingNotificationIntent(fixture.db, {
        actorUserId: confirmationIntent.authorizationUserId,
        intentId: confirmationIntent.id,
        now: confirmationNow,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await failServiceCommerceBookingNotificationIntent(fixture.db, {
        actorUserId: confirmationIntent.authorizationUserId,
        failureCode: "provider_unavailable",
        intentId: confirmationIntent.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(
        await fixture.db.serviceBookingNotificationIntent.findUniqueOrThrow({
          where: { id: confirmationIntent.id },
        }),
      ).toMatchObject({
        attemptCount: 1,
        failureCode: "provider_unavailable",
        status: ServiceBookingNotificationStatus.FAILED,
      })
      expect(
        await fixture.db.serviceBookingNotificationIntent.count({
          where: {
            bookingId: confirmed.id,
            type: ServiceBookingNotificationType.REMINDER,
          },
        }),
      ).toBe(1)

      const rescheduled = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: confirmed.id,
        clientOperationId: `appointment-reschedule-${runId}`,
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
      await expect(
        getPublicServiceCommerceBooking(fixture.db, {
          accessToken: confirmed.accessToken ?? "stale-manage-token",
          now: confirmationNow,
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
      const arrived = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: confirmed.id,
        clientOperationId: `appointment-arrive-${runId}`,
        expectedRevision: rescheduled.revision,
        issueCapabilityToken,
        now: rescheduledStartAt,
        operation: "arrive",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const started = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: confirmed.id,
        clientOperationId: `appointment-start-${runId}`,
        expectedRevision: arrived.revision,
        issueCapabilityToken,
        now: rescheduledStartAt,
        operation: "start",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const completed = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: confirmed.id,
        clientOperationId: `appointment-complete-${runId}`,
        expectedRevision: started.revision,
        issueCapabilityToken,
        now: rescheduledEndAt,
        operation: "complete",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(completed).toMatchObject({ status: "completed" })
      const [completedOrder, completedJob] = await Promise.all([
        fixture.db.commercialOrder.findUniqueOrThrow({
          where: { id: directAcceptance.orderId },
        }),
        fixture.db.serviceJob.findUniqueOrThrow({
          include: { lines: true },
          where: { id: directAcceptance.jobId },
        }),
      ])
      expect(completedOrder.status).toBe("COMPLETED")
      expect(
        completedJob.lines.every((line) => line.status === "COMPLETED"),
      ).toBe(true)

      const releaseSettings = await getServiceCommerceQuoteReleaseSettings(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      await updateServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `appointment-approval-policy-${runId}`,
        expectedRevision: releaseSettings.policy.revision,
        mode: "approval_required",
        reason: "Require a second account for this appointment quotation",
        selectedApproverMembershipIds: [fixture.approverMembershipId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const staffLine = await fixture.db.serviceRequestLine.findFirstOrThrow({
        where: { requestId: staff.source.id },
      })
      const approvedQuote = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `appointment-approved-quote-${runId}`,
        clientVersionId: `appointment-approved-version-${runId}`,
        lines: [
          {
            offeringId: draft.offering.id,
            quantity: "1",
            sourceLineId: staffLine.id,
            unitPriceMinor: 8_500,
          },
        ],
        requestId: staff.source.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(approvedQuote).toMatchObject({
        releaseState: "pending_approval",
        token: null,
      })
      const pendingApprovals = await listPendingServiceCommerceQuoteApprovals(
        fixture.db,
        {
          actorUserId: fixture.approverUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const approval = pendingApprovals.find(
        (item) => item.quoteVersionId === approvedQuote.versionId,
      )
      if (!approval) throw new Error("Appointment Quote approval missing.")
      const released = await approveCommerceQuoteVersion(fixture.db, {
        actorUserId: fixture.approverUserId,
        approvalId: approval.id,
        clientDecisionId: `appointment-approve-${runId}`,
        expectedPolicyRevision: approval.policyRevision,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        reason: "Appointment price and duration verified",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!released.token)
        throw new Error("Approved appointment Quote token missing.")
      const approvedAcceptance = await acceptServiceQuote(fixture.db, {
        acceptanceToken: released.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `appointment-approved-accept-${runId}`,
      })
      if (!approvedAcceptance.jobId)
        throw new Error("Approved appointment Service Job missing.")

      const cancellationStartAt = new Date(slotStartAt.getTime() + 86_400_000)
      const cancellationEndAt = new Date(
        cancellationStartAt.getTime() + 60 * 60_000,
      )
      const approvedSource = { id: staff.source.id, kind: "service" as const }
      const approvedCapability = await createServiceCommerceBookingCapability(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `appointment-approved-capability-${runId}`,
          expiresAt: new Date(confirmationNow.getTime() + 60 * 60_000),
          issueCapabilityToken,
          now: confirmationNow,
          offeringId: draft.offering.id,
          source: approvedSource,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const cancellationHold = await createServiceCommerceBookingHold(
        fixture.db,
        {
          accessToken: approvedCapability.accessToken,
          clientOperationId: `appointment-cancel-hold-${runId}`,
          expectedConfigurationRevision: configuration.revision,
          issueCapabilityToken,
          now: confirmationNow,
          offeringId: draft.offering.id,
          quantity: 1,
          resourceId: resource.id,
          slotEndAt: cancellationEndAt,
          slotStartAt: cancellationStartAt,
          source: approvedSource,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const cancellationBooking = await confirmServiceCommerceBooking(
        fixture.db,
        {
          accessToken:
            cancellationHold.accessToken ?? "missing-cancellation-hold-token",
          clientOperationId: `appointment-cancel-confirm-${runId}`,
          commercialOrderId: approvedAcceptance.orderId,
          holdId: cancellationHold.id,
          issueCapabilityToken,
          now: confirmationNow,
          protectRecipient: (value) => `protected:${value}`,
          quoteVersionId: released.versionId,
          serviceJobId: approvedAcceptance.jobId,
          source: approvedSource,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 2_500,
        clientPaymentId: `appointment-cancel-deposit-${runId}`,
        method: "card",
        orderId: approvedAcceptance.orderId,
        tenantId: fixture.tenantId,
      })
      const cancelled = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: cancellationBooking.id,
        clientOperationId: `appointment-cancel-${runId}`,
        expectedRevision: 0,
        issueCapabilityToken,
        now: confirmationNow,
        operation: "cancel",
        reasonCode: "customer_cancelled_before_cutoff",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(cancelled.refund).toEqual({ amountMinor: 2_500, outcome: "full" })
      await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 2_500,
        clientPaymentId: `appointment-refund-${runId}`,
        method: "card",
        note: "Full cancellation refund before cutoff",
        orderId: approvedAcceptance.orderId,
        tenantId: fixture.tenantId,
        type: "refund",
      })
      expect(
        await fixture.db.serviceBooking.findUniqueOrThrow({
          where: { id: cancellationBooking.id },
        }),
      ).toMatchObject({ paymentStatus: "REFUNDED", status: "CANCELLED" })

      const whatsAppLine = await fixture.db.serviceRequestLine.findFirstOrThrow(
        {
          where: { requestId: whatsapp.source.id },
        },
      )
      const whatsAppQuote = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `appointment-whatsapp-quote-${runId}`,
        clientVersionId: `appointment-whatsapp-version-${runId}`,
        lines: [
          {
            offeringId: draft.offering.id,
            quantity: "1",
            sourceLineId: whatsAppLine.id,
            unitPriceMinor: 8_500,
          },
        ],
        requestId: whatsapp.source.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const whatsAppApproval = (
        await listPendingServiceCommerceQuoteApprovals(fixture.db, {
          actorUserId: fixture.approverUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        })
      ).find((item) => item.quoteVersionId === whatsAppQuote.versionId)
      if (!whatsAppApproval)
        throw new Error("WhatsApp appointment Quote approval missing.")
      const releasedWhatsAppQuote = await approveCommerceQuoteVersion(
        fixture.db,
        {
          actorUserId: fixture.approverUserId,
          approvalId: whatsAppApproval.id,
          clientDecisionId: `appointment-whatsapp-approve-${runId}`,
          expectedPolicyRevision: whatsAppApproval.policyRevision,
          quoteId: whatsAppApproval.quoteId,
          quoteVersionId: whatsAppApproval.quoteVersionId,
          reason: "WhatsApp appointment price and duration verified",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      if (!releasedWhatsAppQuote.token)
        throw new Error("WhatsApp appointment Quote token missing.")
      const whatsAppAcceptance = await acceptServiceQuote(fixture.db, {
        acceptanceToken: releasedWhatsAppQuote.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `appointment-whatsapp-accept-${runId}`,
      })
      if (!whatsAppAcceptance.jobId)
        throw new Error("WhatsApp appointment Service Job missing.")

      const whatsAppStartAt = new Date(slotStartAt.getTime() + 2 * 86_400_000)
      const whatsAppEndAt = new Date(whatsAppStartAt.getTime() + 60 * 60_000)
      const whatsAppSource = {
        id: whatsapp.source.id,
        kind: "service" as const,
      }
      const whatsAppCapability = await createServiceCommerceBookingCapability(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `appointment-whatsapp-capability-${runId}`,
          expiresAt: new Date(confirmationNow.getTime() + 60 * 60_000),
          issueCapabilityToken,
          now: confirmationNow,
          offeringId: draft.offering.id,
          source: whatsAppSource,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const whatsAppHold = await createServiceCommerceBookingHold(fixture.db, {
        accessToken: whatsAppCapability.accessToken,
        clientOperationId: `appointment-whatsapp-hold-${runId}`,
        expectedConfigurationRevision: configuration.revision,
        issueCapabilityToken,
        now: confirmationNow,
        offeringId: draft.offering.id,
        quantity: 1,
        resourceId: resource.id,
        slotEndAt: whatsAppEndAt,
        slotStartAt: whatsAppStartAt,
        source: whatsAppSource,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const whatsAppBooking = await confirmServiceCommerceBooking(fixture.db, {
        accessToken: whatsAppHold.accessToken ?? "missing-whatsapp-hold-token",
        clientOperationId: `appointment-whatsapp-confirm-${runId}`,
        commercialOrderId: whatsAppAcceptance.orderId,
        holdId: whatsAppHold.id,
        issueCapabilityToken,
        now: confirmationNow,
        protectRecipient: (value) => `protected:${value}`,
        quoteVersionId: releasedWhatsAppQuote.versionId,
        serviceJobId: whatsAppAcceptance.jobId,
        source: whatsAppSource,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const [persistedWhatsAppBooking, publicWhatsAppBooking] =
        await Promise.all([
          fixture.db.serviceBooking.findUniqueOrThrow({
            where: { id: whatsAppBooking.id },
          }),
          getPublicServiceCommerceBooking(fixture.db, {
            accessToken:
              whatsAppBooking.accessToken ?? "missing-whatsapp-manage-token",
            now: confirmationNow,
          }),
        ])
      expect(persistedWhatsAppBooking).toMatchObject({
        notificationChannelSnapshot: "WHATSAPP",
        notificationPolicyChannelSnapshot: "WHATSAPP",
      })
      expect(publicWhatsAppBooking).toMatchObject({
        id: whatsAppBooking.id,
        paymentStatus: "pending",
        status: "confirmed",
      })
      expect(JSON.stringify(publicWhatsAppBooking)).not.toContain(
        "+2348444444444",
      )
      expect(JSON.stringify(publicWhatsAppBooking)).not.toContain("protected:")
      await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 2_500,
        clientPaymentId: `appointment-whatsapp-deposit-${runId}`,
        method: "card",
        orderId: whatsAppAcceptance.orderId,
        tenantId: fixture.tenantId,
      })
      const whatsAppReminder =
        await fixture.db.serviceBookingNotificationIntent.findFirstOrThrow({
          where: {
            bookingId: whatsAppBooking.id,
            channel: "WHATSAPP",
            policyChannel: "WHATSAPP",
            type: ServiceBookingNotificationType.REMINDER,
          },
        })
      await claimServiceCommerceBookingNotificationIntent(fixture.db, {
        actorUserId: whatsAppReminder.authorizationUserId,
        intentId: whatsAppReminder.id,
        now: whatsAppReminder.scheduledFor,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await completeServiceCommerceBookingNotificationIntent(fixture.db, {
        actorUserId: whatsAppReminder.authorizationUserId,
        intentId: whatsAppReminder.id,
        now: whatsAppReminder.scheduledFor,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(
        await fixture.db.serviceBookingNotificationIntent.findUniqueOrThrow({
          where: { id: whatsAppReminder.id },
        }),
      ).toMatchObject({ attemptCount: 1, status: "SENT" })
      const whatsAppArrived = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: whatsAppBooking.id,
        clientOperationId: `appointment-whatsapp-arrive-${runId}`,
        expectedRevision: 0,
        issueCapabilityToken,
        now: whatsAppStartAt,
        operation: "arrive",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const whatsAppStarted = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: whatsAppBooking.id,
        clientOperationId: `appointment-whatsapp-start-${runId}`,
        expectedRevision: whatsAppArrived.revision,
        issueCapabilityToken,
        now: whatsAppStartAt,
        operation: "start",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const whatsAppCompleted = await reviseServiceCommerceBooking(fixture.db, {
        actorUserId: fixture.actorUserId,
        bookingId: whatsAppBooking.id,
        clientOperationId: `appointment-whatsapp-complete-${runId}`,
        expectedRevision: whatsAppStarted.revision,
        issueCapabilityToken,
        now: whatsAppEndAt,
        operation: "complete",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(whatsAppCompleted.status).toBe("completed")
      const safeWhatsAppSource =
        await getServiceCommerceCustomerRequestProjection(fixture.db, {
          actorUserId: fixture.actorUserId,
          source: whatsAppSource,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        })
      expect(safeWhatsAppSource).toMatchObject({
        source: whatsAppSource,
        state: "converted",
      })
      expect(JSON.stringify(safeWhatsAppSource)).not.toContain("+2348444444444")

      await expect(
        createServiceCommerceBookingHold(fixture.db, {
          ...holdInput(`appointment-cross-tenant-${runId}`, confirmationNow),
          tenantId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
      await expect(
        createServiceCommerceBookingHold(fixture.db, {
          ...holdInput(`appointment-cross-store-${runId}`, confirmationNow),
          storeId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })

      const [
        bookingEvents,
        configurationEvents,
        approvalAudits,
        catalogCommands,
        convertedQueue,
        pendingApprovalQueue,
        operationsReport,
        operationsAudit,
      ] = await Promise.all([
        fixture.db.serviceBookingEvent.findMany({
          where: { tenantId: fixture.tenantId },
        }),
        fixture.db.serviceBookingConfigurationEvent.findMany({
          where: { tenantId: fixture.tenantId },
        }),
        fixture.db.serviceCommerceQuoteApprovalAuditEvent.findMany({
          where: { tenantId: fixture.tenantId },
        }),
        fixture.db.catalogCommandReceipt.findMany({
          where: { tenantId: fixture.tenantId },
        }),
        listServiceRequests(fixture.db, {
          status: "converted",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
        listPendingServiceCommerceQuoteApprovals(fixture.db, {
          actorUserId: fixture.approverUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
        getServiceOperationsReport(fixture.db, {
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
        exportServiceOperationsAudit(fixture.db, {
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ])
      expect(bookingEvents.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "ARRIVED",
          "CONFIRMED",
          "RESCHEDULED",
          "IN_SERVICE",
          "COMPLETED",
          "CANCELLED",
          "PAYMENT_STATUS_CHANGED",
        ]),
      )
      expect(configurationEvents).toHaveLength(1)
      expect(approvalAudits.length).toBeGreaterThanOrEqual(2)
      expect(catalogCommands.map((command) => command.commandType)).toEqual(
        expect.arrayContaining(["GRADUATE_CATALOG_OFFERING"]),
      )
      expect(convertedQueue).toHaveLength(3)
      expect(pendingApprovalQueue).toHaveLength(0)
      expect(operationsReport.commercial).toEqual({
        immutableServiceQuantity: "3",
        serviceRevenueMinor: 25_500,
      })
      expect(operationsReport.work).toMatchObject({ completed: 2, wip: 1 })
      expect(operationsAudit.length).toBeGreaterThanOrEqual(4)
      expect(operationsAudit.map((event) => event.source)).toEqual(
        expect.arrayContaining(["service_commerce_booking"]),
      )
      expect(
        await fixture.db.serviceCommerceMediaAsset.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(0)
    }, 720_000)
  },
)
