import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import {
  OrderStatus,
  PaymentStatus,
  PrescriptionPickupStatus,
  PrescriptionRequestSource,
  PrescriptionRequestStatus,
} from "../../../../generated/prisma/enums"
import {
  handoffPrescriptionPickup,
  listPrescriptionPickupQueue,
  markPrescriptionPickupReady,
} from "../../prescription-fulfillment"
import { getPrescriptionOperationsReport } from "../../prescription-reporting"
import {
  acceptPrescriptionPickupQuote,
  getPrescriptionRequest,
  getPublicPrescriptionRequestStatus,
} from "../../prescription-requests"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"
import {
  type IntakeOrigin,
  acceptAndPayPrescriptionQuote,
  prepareReleasedPrescriptionQuote,
} from "./prescription-lifecycle"

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce prescription pickup compatibility",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    async function completePickup(origin: IntakeOrigin) {
      const prepared = await prepareReleasedPrescriptionQuote(
        fixture,
        origin,
        "pickup",
      )
      const acceptanceInput = {
        acceptanceToken: prepared.quoteToken,
        clientAcceptanceId: `${origin}-acceptance-${prepared.runId}`,
        partialAcknowledged: false,
      }
      const { accepted, inventoryAfterAcceptance } =
        await acceptAndPayPrescriptionQuote(fixture, {
          accept: () =>
            acceptPrescriptionPickupQuote(fixture.db, acceptanceInput),
          origin,
          quoteToken: prepared.quoteToken,
          runId: prepared.runId,
          totalMinor: 2_500,
        })
      expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
        Number(prepared.inventoryBeforeAcceptance.reservedQuantity) + 1,
      )

      const fulfillment =
        await fixture.db.prescriptionPickupFulfillment.findFirstOrThrow({
          where: {
            orderId: accepted.orderId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        })
      const preparingQueue = await listPrescriptionPickupQueue(fixture.db, {
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(preparingQueue.map((item) => item.id)).toContain(fulfillment.id)
      const readyInput = {
        actorUserId: fixture.actorUserId,
        checks: { label_matches: true, pharmacist_released: true },
        clientOperationId: `${origin}-pickup-ready-${prepared.runId}`,
        fulfillmentId: fulfillment.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const [ready, readyReplay] = await Promise.all([
        markPrescriptionPickupReady(fixture.db, readyInput),
        markPrescriptionPickupReady(fixture.db, readyInput),
      ])
      expect(readyReplay.pickupCode).toBe(ready.pickupCode)
      const publicReadyStatus = await getPublicPrescriptionRequestStatus(
        fixture.db,
        { statusToken: prepared.statusToken },
      )
      expect(publicReadyStatus).toMatchObject({
        pickup: { code: ready.pickupCode },
        status: "converted",
        storeName: "Acceptance Pharmacy",
      })
      expect(JSON.stringify(publicReadyStatus)).not.toMatch(
        /Acceptance Medicine|example\.invalid|2348111111111|objectKey/i,
      )
      const handoffInput = {
        actorUserId: fixture.actorUserId,
        clientOperationId: `${origin}-handoff-${prepared.runId}`,
        collectorName: "Synthetic Acceptance Customer",
        fulfillmentId: fulfillment.id,
        pickupCode: ready.pickupCode,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      await expect(
        Promise.all([
          handoffPrescriptionPickup(fixture.db, handoffInput),
          handoffPrescriptionPickup(fixture.db, handoffInput),
        ]),
      ).resolves.toEqual([{ handedOff: true }, { handedOff: true }])

      const [completedRequest, completedOrder, completedPickup] =
        await Promise.all([
          fixture.db.prescriptionRequest.findUniqueOrThrow({
            where: { id: prepared.request.id },
          }),
          fixture.db.commercialOrder.findUniqueOrThrow({
            where: { id: accepted.orderId },
          }),
          fixture.db.prescriptionPickupFulfillment.findUniqueOrThrow({
            where: { id: fulfillment.id },
          }),
        ])
      expect(completedRequest.status).toBe(PrescriptionRequestStatus.CONVERTED)
      expect(completedOrder.paymentStatus).toBe(PaymentStatus.PAID)
      expect(completedOrder.status).toBe(OrderStatus.COMPLETED)
      expect(completedPickup.status).toBe(PrescriptionPickupStatus.HANDED_OFF)
      await expect(
        getPublicPrescriptionRequestStatus(fixture.db, {
          statusToken: prepared.statusToken,
        }),
      ).resolves.toMatchObject({ pickup: null, status: "converted" })
      const managementRequest = await getPrescriptionRequest(fixture.db, {
        actorUserId: fixture.actorUserId,
        reason: "acceptance_evidence",
        requestId: prepared.request.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(managementRequest.auditEvents.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "RECEIVED",
          "TRANSCRIPTION_REQUESTED",
          "TRANSCRIPTION_COMPLETED",
          "LINE_VERIFIED",
          "PHARMACIST_REVIEWED",
          "QUOTE_ISSUED",
          "CONVERTED",
        ]),
      )
      const report = await getPrescriptionOperationsReport(fixture.db, {
        from: fixture.fixtureStartedAt,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        to: new Date(Date.now() + 60_000),
      })
      expect(
        report.channelMix[completedRequest.source.toLowerCase()],
      ).toBeGreaterThanOrEqual(1)
      expect(report.payment.paidCount).toBeGreaterThanOrEqual(1)
      expect(report.pickupCompleted).toBeGreaterThanOrEqual(1)
      expect(report.usage.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          "REQUEST_RECEIVED",
          "QUOTE_ISSUED",
          "ORDER_CREATED",
          "PAYMENT_SUCCEEDED",
          "PICKUP_COMPLETED",
        ]),
      )
      return completedRequest.source
    }

    const origins = [
      ["web", PrescriptionRequestSource.WEB],
      ["staff", PrescriptionRequestSource.STAFF_WALK_IN],
      ["whatsapp", PrescriptionRequestSource.WHATSAPP],
    ] as const

    for (const [origin, expectedSource] of origins) {
      test(`completes a safe-media paid pickup lifecycle from ${origin} intake`, async () => {
        expect(await completePickup(origin)).toBe(expectedSource)
      }, 180_000)
    }

    test("keeps a pharmacist-selected substitute as one included payable Order line", async () => {
      const prepared = await prepareReleasedPrescriptionQuote(
        fixture,
        "staff",
        "pickup",
        { isAlternative: true },
      )
      expect(prepared.publicQuote.lines).toMatchObject([
        { outcome: "included", totalMinor: 2_500 },
      ])
      expect(prepared.publicQuote.totalMinor).toBe(2_500)

      const accepted = await acceptPrescriptionPickupQuote(fixture.db, {
        acceptanceToken: prepared.quoteToken,
        clientAcceptanceId: `staff-substitute-${prepared.runId}`,
        partialAcknowledged: false,
      })
      const order = await fixture.db.commercialOrder.findFirstOrThrow({
        include: { lines: true },
        where: {
          id: accepted.orderId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      expect(order.lines).toHaveLength(1)
      expect(order.totalMinor).toBe(2_500)
    }, 180_000)
  },
)
