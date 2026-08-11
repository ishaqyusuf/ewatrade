import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import { PrescriptionDeliveryStatus } from "../../../../generated/prisma/enums"
import {
  approvePrescriptionManualDeliveryFee,
  createPrescriptionDeliveryAssignment,
  listPrescriptionDeliveryQueue,
  listPrescriptionManualDeliveryReviews,
  markPrescriptionDeliveryReady,
  revisePrescriptionQuoteForDelivery,
  transitionPrescriptionDelivery,
} from "../../prescription-fulfillment"
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
  acceptAndPayPrescriptionQuote,
  prepareReleasedPrescriptionQuote,
} from "./prescription-lifecycle"

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce prescription manual delivery compatibility",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("completes an authorized manual-fee delivery quote through paid acceptance", async () => {
      const prepared = await prepareReleasedPrescriptionQuote(
        fixture,
        "web",
        "delivery",
      )
      const manualSelection = await revisePrescriptionQuoteForDelivery(
        fixture.db,
        {
          acceptanceToken: prepared.quoteToken,
          address: {
            addressLine1: "2 Synthetic Manual Review Road",
            locality: " manual review district ",
            postalCode: "100002",
            recipientName: "Synthetic Acceptance Customer",
            recipientPhone: "+2348111111111",
            region: "Lagos",
          },
        },
      )
      expect(manualSelection).toMatchObject({
        acceptanceToken: null,
        outcome: "manual_review",
      })
      if (manualSelection.outcome !== "manual_review") {
        throw new Error("Manual delivery review was not created.")
      }
      const reviews = await listPrescriptionManualDeliveryReviews(fixture.db, {
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(reviews.map((review) => review.id)).toContain(
        manualSelection.manualReviewId,
      )
      const approved = await approvePrescriptionManualDeliveryFee(fixture.db, {
        actorUserId: fixture.actorUserId,
        addressId: manualSelection.manualReviewId,
        clientDecisionId: `manual-delivery-${prepared.runId}`,
        feeMinor: 750,
        reason: "Synthetic courier estimate confirmed",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!approved.acceptanceToken) {
        throw new Error("Approved manual delivery token was not issued.")
      }
      await expect(
        getPublicPrescriptionQuote(fixture.db, {
          acceptanceToken: prepared.quoteToken,
        }),
      ).rejects.toThrow("Quote is unavailable")
      const manualQuote = await getPublicPrescriptionQuote(fixture.db, {
        acceptanceToken: approved.acceptanceToken,
      })
      expect(manualQuote).toMatchObject({
        fulfilmentFeeMinor: 750,
        fulfilmentPromise: "Delivery after staff confirmation",
        fulfilmentType: "delivery",
        totalMinor: 3_250,
        version: 2,
      })
      expect(JSON.stringify(manualQuote)).not.toMatch(
        /Manual Review Road|2348111111111|evaluationReason|tenantId/i,
      )
      const acceptanceInput = {
        acceptanceToken: approved.acceptanceToken,
        clientAcceptanceId: `manual-delivery-acceptance-${prepared.runId}`,
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
          },
          origin: "web",
          quoteToken: approved.acceptanceToken,
          runId: `manual-${prepared.runId}`,
          totalMinor: 3_250,
        })
      expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
        Number(prepared.inventoryBeforeAcceptance.reservedQuantity) + 1,
      )
      const readyInput = {
        actorUserId: fixture.actorUserId,
        checks: { label_matches: true, pharmacist_released: true },
        clientOperationId: `manual-ready-${prepared.runId}`,
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
        clientOperationId: `manual-assignment-${prepared.runId}`,
        courierDisplayName: "Synthetic Manual Courier",
        courierReference: `manual-courier-${prepared.runId}`,
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
        clientOperationId: `manual-failed-${prepared.runId}`,
        reason: "Synthetic manual-delivery customer unavailable",
        status: "failed",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(failed.assignment.status).toBe(PrescriptionDeliveryStatus.FAILED)
      await transitionPrescriptionDelivery(fixture.db, {
        actorUserId: fixture.actorUserId,
        assignmentId: ready.assignment.id,
        clientOperationId: `manual-rescheduled-${prepared.runId}`,
        reason: "Synthetic manual-delivery time confirmed",
        status: "rescheduled",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await createPrescriptionDeliveryAssignment(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `manual-reassignment-${prepared.runId}`,
        courierDisplayName: "Synthetic Manual Recovery Courier",
        courierReference: `manual-recovery-${prepared.runId}`,
        orderId: accepted.orderId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      for (const status of ["collected", "in_transit"] as const) {
        await transitionPrescriptionDelivery(fixture.db, {
          actorUserId: fixture.actorUserId,
          assignmentId: ready.assignment.id,
          clientOperationId: `manual-${status}-${prepared.runId}`,
          status,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        })
      }
      const deliveredInput = {
        actorUserId: fixture.actorUserId,
        assignmentId: ready.assignment.id,
        clientOperationId: `manual-delivered-${prepared.runId}`,
        proofReference: `manual-proof-${prepared.runId}`,
        status: "delivered" as const,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      await expect(
        Promise.all([
          transitionPrescriptionDelivery(fixture.db, deliveredInput),
          transitionPrescriptionDelivery(fixture.db, deliveredInput),
        ]),
      ).resolves.toEqual([
        expect.objectContaining({
          assignment: expect.objectContaining({ status: "DELIVERED" }),
        }),
        expect.objectContaining({
          assignment: expect.objectContaining({ status: "DELIVERED" }),
        }),
      ])
      const queue = await listPrescriptionDeliveryQueue(fixture.db, {
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(queue.some((item) => item.id === accepted.orderId)).toBe(false)
      expect(JSON.stringify(queue)).not.toMatch(
        /Manual Review Road|2348111111111|manual-proof/i,
      )
    }, 360_000)
  },
)
