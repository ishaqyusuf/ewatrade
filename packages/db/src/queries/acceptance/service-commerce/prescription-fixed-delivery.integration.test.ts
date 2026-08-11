import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import {
  OrderStatus,
  PaymentStatus,
  PrescriptionDeliveryStatus,
} from "../../../../generated/prisma/enums"
import {
  createPrescriptionDeliveryAssignment,
  listPrescriptionDeliveryQueue,
  markPrescriptionDeliveryReady,
  revisePrescriptionQuoteForDelivery,
  transitionPrescriptionDelivery,
} from "../../prescription-fulfillment"
import { getPrescriptionOperationsReport } from "../../prescription-reporting"
import {
  acceptPrescriptionDeliveryQuote,
  getPublicPrescriptionQuote,
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
  "Service Commerce prescription fixed delivery compatibility",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    async function completeDelivery(origin: IntakeOrigin) {
      const prepared = await prepareReleasedPrescriptionQuote(
        fixture,
        origin,
        "delivery",
      )
      const deliverySelection = await revisePrescriptionQuoteForDelivery(
        fixture.db,
        {
          acceptanceToken: prepared.quoteToken,
          address: {
            addressLine1: "1 Synthetic Acceptance Road",
            locality: " acceptance   district ",
            postalCode: "100001",
            recipientName: "Synthetic Acceptance Customer",
            recipientPhone: "+2348111111111",
            region: "Lagos",
          },
        },
      )
      expect(deliverySelection.outcome).toBe("eligible")
      if (!deliverySelection.acceptanceToken) {
        throw new Error("Delivery Quote token was not issued.")
      }
      await expect(
        getPublicPrescriptionQuote(fixture.db, {
          acceptanceToken: prepared.quoteToken,
        }),
      ).rejects.toThrow("Quote is unavailable")
      const deliveryQuote = await getPublicPrescriptionQuote(fixture.db, {
        acceptanceToken: deliverySelection.acceptanceToken,
      })
      expect(deliveryQuote).toMatchObject({
        accepted: false,
        fulfilmentFeeMinor: 500,
        fulfilmentPromise: "Delivery within four hours",
        fulfilmentType: "delivery",
        storeName: "Acceptance Pharmacy",
        totalMinor: 3_000,
        version: 2,
      })
      expect(JSON.stringify(deliveryQuote)).not.toMatch(
        /Acceptance Road|2348111111111|objectKey|tenantId/i,
      )

      const acceptanceInput = {
        acceptanceToken: deliverySelection.acceptanceToken,
        clientAcceptanceId: `${origin}-delivery-acceptance-${prepared.runId}`,
        partialAcknowledged: false,
      }
      const { accepted, inventoryAfterAcceptance } =
        await acceptAndPayPrescriptionQuote(fixture, {
          accept: () =>
            acceptPrescriptionDeliveryQuote(fixture.db, acceptanceInput),
          afterAcceptance: async (acceptedBeforePayment) => {
            await expect(
              markPrescriptionDeliveryReady(fixture.db, {
                actorUserId: fixture.actorUserId,
                checks: {
                  label_matches: true,
                  pharmacist_released: true,
                },
                orderId: acceptedBeforePayment.orderId,
                storeId: fixture.storeId,
                tenantId: fixture.tenantId,
              }),
            ).rejects.toThrow()
            await expect(
              createPrescriptionDeliveryAssignment(fixture.db, {
                actorUserId: fixture.actorUserId,
                courierDisplayName: "Premature Courier",
                courierReference: `premature-unpaid-${prepared.runId}`,
                orderId: acceptedBeforePayment.orderId,
                storeId: fixture.storeId,
                tenantId: fixture.tenantId,
              }),
            ).rejects.toThrow()
          },
          origin,
          quoteToken: deliverySelection.acceptanceToken,
          runId: prepared.runId,
          totalMinor: 3_000,
        })
      expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
        Number(prepared.inventoryBeforeAcceptance.reservedQuantity) + 1,
      )
      await expect(
        createPrescriptionDeliveryAssignment(fixture.db, {
          actorUserId: fixture.actorUserId,
          courierDisplayName: "Premature Courier",
          courierReference: `premature-unpacked-${prepared.runId}`,
          orderId: accepted.orderId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toThrow()

      const beforePacking = await listPrescriptionDeliveryQueue(fixture.db, {
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(beforePacking.map((item) => item.id)).toContain(accepted.orderId)
      await expect(
        markPrescriptionDeliveryReady(fixture.db, {
          actorUserId: `unauthorized-${prepared.runId}`,
          checks: { label_matches: true, pharmacist_released: true },
          orderId: accepted.orderId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toThrow()
      const readyInput = {
        actorUserId: fixture.actorUserId,
        checks: { label_matches: true, pharmacist_released: true },
        clientOperationId: `${origin}-delivery-ready-${prepared.runId}`,
        orderId: accepted.orderId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const [ready, readyReplay] = await Promise.all([
        markPrescriptionDeliveryReady(fixture.db, readyInput),
        markPrescriptionDeliveryReady(fixture.db, readyInput),
      ])
      expect(readyReplay.assignment.id).toBe(ready.assignment.id)
      expect(ready.assignment.status).toBe(
        PrescriptionDeliveryStatus.READY_FOR_ASSIGNMENT,
      )
      const assignmentInput = {
        actorUserId: fixture.actorUserId,
        clientOperationId: `${origin}-delivery-assignment-${prepared.runId}`,
        courierDisplayName: "Synthetic Courier",
        courierPhoneMasked: "******1111",
        courierReference: `courier-${prepared.runId}`,
        orderId: accepted.orderId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const [assigned, assignedReplay] = await Promise.all([
        createPrescriptionDeliveryAssignment(fixture.db, assignmentInput),
        createPrescriptionDeliveryAssignment(fixture.db, assignmentInput),
      ])
      expect(assignedReplay.id).toBe(assigned.id)
      expect(assigned.status).toBe(PrescriptionDeliveryStatus.ASSIGNED)

      const failed = await transitionPrescriptionDelivery(fixture.db, {
        actorUserId: fixture.actorUserId,
        assignmentId: ready.assignment.id,
        clientOperationId: `${origin}-delivery-failed-${prepared.runId}`,
        reason: "Synthetic customer unavailable",
        status: "failed",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(failed.assignment.status).toBe(PrescriptionDeliveryStatus.FAILED)
      const rescheduled = await transitionPrescriptionDelivery(fixture.db, {
        actorUserId: fixture.actorUserId,
        assignmentId: ready.assignment.id,
        clientOperationId: `${origin}-delivery-rescheduled-${prepared.runId}`,
        reason: "Synthetic customer confirmed a new time",
        status: "rescheduled",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(rescheduled.assignment.status).toBe(
        PrescriptionDeliveryStatus.RESCHEDULED,
      )
      const reassigned = await createPrescriptionDeliveryAssignment(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          courierDisplayName: "Synthetic Recovery Courier",
          courierPhoneMasked: "******2222",
          courierReference: `recovery-courier-${prepared.runId}`,
          orderId: accepted.orderId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      expect(reassigned.status).toBe(PrescriptionDeliveryStatus.ASSIGNED)

      const operationalQueue = await listPrescriptionDeliveryQueue(fixture.db, {
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const queueItem = operationalQueue.find(
        (item) => item.id === accepted.orderId,
      )
      expect(queueItem).toMatchObject({
        prescriptionDeliveryAddress: {
          feeMinor: 500,
          promiseText: "Delivery within four hours",
        },
        prescriptionDeliveryAssignment: {
          courierDisplayName: "Synthetic Recovery Courier",
          courierReference: `recovery-courier-${prepared.runId}`,
          status: "ASSIGNED",
        },
        totalMinor: 3_000,
      })
      expect(JSON.stringify(queueItem)).not.toMatch(
        /Acceptance Road|2348111111111|Acceptance Medicine|objectKey|transcription|credential/i,
      )
      await expect(
        listPrescriptionDeliveryQueue(fixture.db, {
          storeId: fixture.storeId,
          tenantId: "cross-tenant-acceptance",
        }),
      ).resolves.toEqual([])

      const assignmentId = ready.assignment.id
      await transitionPrescriptionDelivery(fixture.db, {
        actorUserId: fixture.actorUserId,
        assignmentId,
        clientOperationId: `${origin}-delivery-collected-${prepared.runId}`,
        status: "collected",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await transitionPrescriptionDelivery(fixture.db, {
        actorUserId: fixture.actorUserId,
        assignmentId,
        clientOperationId: `${origin}-delivery-transit-${prepared.runId}`,
        status: "in_transit",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const completionInput = {
        actorUserId: fixture.actorUserId,
        assignmentId,
        clientOperationId: `${origin}-delivery-completed-${prepared.runId}`,
        proofReference: `proof-${prepared.runId}`,
        status: "delivered" as const,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const completions = await Promise.all([
        transitionPrescriptionDelivery(fixture.db, completionInput),
        transitionPrescriptionDelivery(fixture.db, completionInput),
      ])
      expect(completions.map((result) => result.assignment.status)).toEqual([
        PrescriptionDeliveryStatus.DELIVERED,
        PrescriptionDeliveryStatus.DELIVERED,
      ])

      const [completedOrder, completedDelivery, completionEvents] =
        await Promise.all([
          fixture.db.commercialOrder.findUniqueOrThrow({
            where: { id: accepted.orderId },
          }),
          fixture.db.prescriptionDeliveryAssignment.findUniqueOrThrow({
            include: { address: true },
            where: { id: assignmentId },
          }),
          fixture.db.prescriptionDeliveryEvent.findMany({
            orderBy: { effectiveAt: "asc" },
            where: { assignmentId },
          }),
        ])
      expect(completedOrder).toMatchObject({
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.COMPLETED,
        totalMinor: 3_000,
      })
      expect(completedDelivery).toMatchObject({
        proofReference: `proof-${prepared.runId}`,
        status: PrescriptionDeliveryStatus.DELIVERED,
      })
      expect(completedDelivery.address.encryptedPayload).not.toMatch(
        /Acceptance Road|2348111111111/,
      )
      expect(completionEvents.map((event) => event.type)).toEqual([
        "CREATED",
        "ASSIGNED",
        "FAILED",
        "RESCHEDULED",
        "ASSIGNED",
        "COLLECTED",
        "IN_TRANSIT",
        "DELIVERED",
      ])
      expect(
        completionEvents.filter(
          (event) => event.idempotencyKey === completionInput.clientOperationId,
        ),
      ).toHaveLength(1)
      const afterCompletion = await listPrescriptionDeliveryQueue(fixture.db, {
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(afterCompletion.map((item) => item.id)).not.toContain(
        accepted.orderId,
      )
      const communicationIntents =
        await fixture.db.prescriptionCommunicationIntent.findMany({
          where: {
            orderId: accepted.orderId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        })
      expect(communicationIntents.map((intent) => intent.type)).toEqual(
        expect.arrayContaining(["DELIVERY_FAILED", "DELIVERY_PROGRESS"]),
      )
      expect(JSON.stringify(communicationIntents)).not.toMatch(
        /Acceptance Road|Acceptance Medicine|objectKey|transcription/i,
      )
      const report = await getPrescriptionOperationsReport(fixture.db, {
        from: fixture.fixtureStartedAt,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        to: new Date(Date.now() + 60_000),
      })
      expect(report.deliveryCompleted).toBeGreaterThanOrEqual(1)
      expect(report.usage.map((event) => event.eventType)).toContain(
        "DELIVERY_COMPLETED",
      )
      return completedOrder.id
    }

    for (const origin of ["web", "staff", "whatsapp"] as const) {
      test(`completes a fixed-fee paid delivery lifecycle from ${origin} intake`, async () => {
        expect(await completeDelivery(origin)).toEqual(expect.any(String))
      }, 360_000)
    }
  },
)
