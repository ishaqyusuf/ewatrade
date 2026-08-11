import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import {
  CommerceQuoteSourceType,
  ServiceBookingPaymentRequirement,
  ServiceBookingPaymentStatus,
  ServiceBookingRefundPolicy,
  ServiceBookingResourceKind,
  ServiceBookingStatus,
  ServiceJobLineStatus,
  ServiceWorkEventType,
} from "../../../../generated/prisma/enums"
import { recordCommercialOrderPayment } from "../../commercial-payments"
import {
  getServiceCommerceReport,
  getServiceCommerceReportDrilldown,
  recordServiceCommerceUsageEvent,
} from "../../service-commerce-reporting"
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

setDefaultTimeout(180_000)

describeWithServiceCommerceDatabase(
  "Service Commerce reporting and usage on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("scopes authoritative lifecycle aggregates and immutable usage to one Store and half-open occurrence window", async () => {
      const runId = randomUUID()
      const start = new Date("2035-01-01T00:00:00.000Z")
      const inside = new Date("2035-01-15T10:00:00.000Z")
      const end = new Date("2035-02-01T00:00:00.000Z")
      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: `Reporting acceptance ${runId}`,
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const request = await submitPublicServiceRequest(fixture.db, {
        clientRequestId: `report-request-${runId}`,
        customerName: "Synthetic Reporting Customer",
        details: "Run-owned reporting acceptance request.",
        formToken: form.token,
        lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
      })
      const quote = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `report-quote-${runId}`,
        clientVersionId: `report-version-${runId}`,
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
      if (!quote.token) throw new Error("Reporting Quote token was not issued.")
      const accepted = await acceptServiceQuote(fixture.db, {
        acceptanceToken: quote.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `report-acceptance-${runId}`,
      })
      const jobId =
        accepted.jobId ??
        (
          await fixture.db.serviceJob.create({
            data: {
              clientJobId: `report-job-${runId}`,
              commercialOrderId: accepted.orderId,
              createdByUserId: fixture.actorUserId,
              storeId: fixture.storeId,
              tenantId: fixture.tenantId,
            },
          })
        ).id

      const payment = await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 7_500,
        clientPaymentId: `report-payment-${runId}`,
        method: "cash",
        orderId: accepted.orderId,
        tenantId: fixture.tenantId,
      })
      const version = await fixture.db.commerceQuoteVersion.findFirstOrThrow({
        where: { quote: { sourceId: request.id, tenantId: fixture.tenantId } },
      })
      const resource = await fixture.db.serviceBookingResource.create({
        data: {
          capacity: 1,
          clientResourceId: `report-resource-${runId}`,
          kind: ServiceBookingResourceKind.ROOM,
          name: `Reporting Room ${runId}`,
          payloadHash: runId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          updatedByUserId: fixture.actorUserId,
        },
      })
      const configuration =
        await fixture.db.serviceBookingOfferingConfig.create({
          data: {
            cancellationWindowMinutes: 0,
            durationMinutes: 60,
            offeringId: fixture.serviceOfferingId,
            paymentRequirement: ServiceBookingPaymentRequirement.NONE,
            refundPolicy: ServiceBookingRefundPolicy.NONE,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
            updatedByUserId: fixture.actorUserId,
          },
        })
      await fixture.db.serviceBooking.create({
        data: {
          cancellationPolicyRevisionSnapshot: 0,
          cancellationWindowSnapshot: 0,
          capacity: 1,
          clientBookingId: `report-booking-${runId}`,
          commercialOrderId: accepted.orderId,
          currencyCodeSnapshot: "NGN",
          endAt: new Date(inside.getTime() + 60 * 60_000),
          offeringConfigId: configuration.id,
          offeringPolicyRevisionSnapshot: 0,
          payableAmountMinorSnapshot: 7_500,
          paymentPolicyRevisionSnapshot: 0,
          paymentRequirementSnapshot: ServiceBookingPaymentRequirement.NONE,
          paymentStatus: ServiceBookingPaymentStatus.NOT_REQUIRED,
          payloadHash: runId,
          quoteVersionId: version.id,
          refundPolicySnapshot: ServiceBookingRefundPolicy.NONE,
          requiredPaymentMinorSnapshot: 0,
          reminderLeadMinutesSnapshot: 0,
          resourceId: resource.id,
          serviceJobId: jobId,
          sourceId: request.id,
          sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
          startAt: inside,
          status: ServiceBookingStatus.COMPLETED,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          timezoneSnapshot: "Africa/Lagos",
          completedAt: inside,
          confirmedAt: inside,
          serviceStartedAt: inside,
        },
      })
      await fixture.db.$transaction([
        fixture.db.serviceRequest.update({
          data: { requestedAt: inside },
          where: { id: request.id },
        }),
        fixture.db.commerceQuoteVersion.update({
          data: { acceptedAt: inside, issuedAt: inside },
          where: { id: version.id },
        }),
        fixture.db.commercialOrderPayment.update({
          data: { recordedAt: inside },
          where: { id: payment.id },
        }),
        fixture.db.serviceWorkEvent.create({
          data: {
            actorUserId: fixture.actorUserId,
            clientCommandId: `report-complete-${runId}`,
            effectiveAt: inside,
            serviceJobId: jobId,
            source: "reporting_acceptance",
            tenantId: fixture.tenantId,
            toStatus: ServiceJobLineStatus.COMPLETED,
            type: ServiceWorkEventType.STATUS_CHANGED,
          },
        }),
      ])

      const usageInput = {
        currencyCode: "NGN",
        eventType: "message_delivered" as const,
        occurredAt: inside,
        sourceId: request.id,
        sourceKind: "service" as const,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const usage = await recordServiceCommerceUsageEvent(fixture.db, {
        ...usageInput,
        deduplicationKey: `report-usage-${runId}`,
      })
      await expect(
        recordServiceCommerceUsageEvent(fixture.db, {
          ...usageInput,
          deduplicationKey: `report-usage-${runId}`,
        }),
      ).resolves.toMatchObject({ id: usage.id })
      await expect(
        recordServiceCommerceUsageEvent(fixture.db, {
          ...usageInput,
          deduplicationKey: `report-usage-${runId}`,
          sourceId: `${request.id}-changed`,
        }),
      ).rejects.toThrow("SERVICE_COMMERCE_USAGE_DEDUPLICATION_CONFLICT")
      await recordServiceCommerceUsageEvent(fixture.db, {
        ...usageInput,
        deduplicationKey: `report-end-exclusive-${runId}`,
        occurredAt: end,
      })
      await recordServiceCommerceUsageEvent(fixture.db, {
        currencyCode: "NGN",
        deduplicationKey: `report-delivery-${runId}`,
        deliveryCostMinor: 0,
        eventType: "delivery_reconciled",
        occurredAt: inside,
        sourceId: request.id,
        sourceKind: "service",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })

      const report = await getServiceCommerceReport(fixture.db, {
        actorUserId: fixture.actorUserId,
        end,
        start,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(report.scope).toEqual({
        end,
        start,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(report.lifecycle).toMatchObject({
        bookingsCompleted: 1,
        bookingsConfirmed: 1,
        paymentsSucceeded: 1,
        quotesAccepted: 1,
        quotesIssued: 1,
        requestsReceived: 1,
        serviceCompletions: 1,
      })
      expect(report.lifecycle.byChannel).toContainEqual({
        channel: "web",
        count: 1,
      })
      expect(report.lifecycle.bySource).toContainEqual({
        source: "service",
        count: 1,
      })
      expect(report.costs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            costKind: "delivery",
            knownCount: 1,
            knownTotalMinor: 0,
            unknownCount: 0,
          }),
          expect.objectContaining({
            costKind: "meta_delivered_message",
            knownCount: 0,
            knownTotalMinor: null,
            unknownCount: 1,
          }),
        ]),
      )

      const drilldown = await getServiceCommerceReportDrilldown(fixture.db, {
        actorUserId: fixture.actorUserId,
        category: "costs",
        end,
        start,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(drilldown.rows).toHaveLength(2)
      expect(drilldown.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "delivery_reconciled",
            count: 1,
          }),
          expect.objectContaining({ category: "message_delivered", count: 1 }),
        ]),
      )
      expect(JSON.stringify(drilldown)).not.toMatch(
        /Synthetic Reporting Customer|customer|objectKey|providerAttemptId/i,
      )
      const readAudits =
        await fixture.db.serviceCommerceReportReadAuditEvent.findMany({
          orderBy: { effectiveAt: "asc" },
          select: {
            actorUserId: true,
            denialReason: true,
            drilldownSection: true,
            kind: true,
            outcome: true,
            purpose: true,
            reportEnd: true,
            reportStart: true,
            source: true,
            storeId: true,
            tenantId: true,
          },
          where: { tenantId: fixture.tenantId },
        })
      expect(readAudits).toEqual([
        {
          actorUserId: fixture.actorUserId,
          denialReason: null,
          drilldownSection: null,
          kind: "REPORT",
          outcome: "ALLOWED",
          purpose: "service_commerce_report_read",
          reportEnd: end,
          reportStart: start,
          source: "SERVICE_COMMERCE_REPORTING",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
        {
          actorUserId: fixture.actorUserId,
          denialReason: null,
          drilldownSection: "COSTS",
          kind: "DRILLDOWN",
          outcome: "ALLOWED",
          purpose: "service_commerce_report_drilldown_read",
          reportEnd: end,
          reportStart: start,
          source: "SERVICE_COMMERCE_REPORTING",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      ])
    }, 180_000)
  },
)
