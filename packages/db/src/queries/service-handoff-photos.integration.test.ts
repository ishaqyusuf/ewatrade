import { randomUUID } from "node:crypto"

import { expect, test } from "bun:test"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  completeServiceJob,
  getServiceJob,
  markServiceEvidencePhotoUploaded,
  publishServiceEvidence,
  recordServiceHandoff,
  startServiceEvidencePhotoUpload,
} from "./service-work"

describeWithServiceCommerceDatabase("service hand-over and job photos", () => {
  test("hand-over records who and how, warns on an unpaid balance, replays its command and refuses a repeat; photos stay private", async () => {
    const { prisma: db } = await import("../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `service-handoff-photos-${suffix}@example.invalid`,
        name: "Ada Handover",
      },
    })
    let tenantId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          dataClassification: "QA",
          enabledModes: ["MERCHANT"],
          name: "Service hand-over QA",
          slug: `service-handoff-photos-${suffix}`,
          type: "MERCHANT",
          users: {
            create: { role: "OWNER", status: "ACTIVE", userId: user.id },
          },
        },
      })
      tenantId = tenant.id
      const store = await db.store.create({
        data: {
          name: "Hand-over QA",
          slug: `handoff-photos-${suffix}`,
          status: "ACTIVE",
          tenantId: tenant.id,
        },
      })
      const item = await db.catalogItem.create({
        data: {
          kind: "SERVICE",
          name: "Laundry",
          slug: `laundry-${suffix}`,
          status: "ACTIVE",
          tenantId: tenant.id,
          service: { create: {} },
        },
      })
      const variant = await db.sellableVariant.create({
        data: {
          catalogItemId: item.id,
          isDefault: true,
          key: "default",
          name: "Laundry",
          status: "ACTIVE",
        },
      })
      const offering = await db.sellableOffering.create({
        data: {
          catalogItemId: item.id,
          currencyCode: "NGN",
          fixedPriceMinor: 200_000,
          key: "laundry",
          kind: "SERVICE",
          name: "Laundry",
          pricingPolicy: "FIXED",
          status: "ACTIVE",
          tenantId: tenant.id,
          variantId: variant.id,
          serviceOffering: {
            create: {
              authorizationPolicy: "ON_ORDER_CONFIRMATION",
              workPolicy: "TRACKED",
            },
          },
        },
      })
      const order = await db.commercialOrder.create({
        data: {
          amountPaidMinor: 0,
          clientOrderId: `handoff-photos:${suffix}`,
          createdByUserId: user.id,
          currencyCode: "NGN",
          orderNumber: `QA-handoff-photos-${suffix}`,
          payloadHash: `qa:handoff-photos:${suffix}`,
          paymentStatus: "PENDING",
          status: "CONFIRMED",
          storeId: store.id,
          subtotalMinor: 200_000,
          tenantId: tenant.id,
          totalMinor: 200_000,
          lines: {
            create: {
              kind: "SERVICE",
              offeringId: offering.id,
              quantity: "1",
              totalMinor: 200_000,
              unitPriceMinor: 200_000,
            },
          },
        },
        include: { lines: true },
      })
      const orderLine = order.lines[0]
      if (!orderLine) throw new Error("Order fixture has no line")
      const job = await db.serviceJob.create({
        data: {
          clientJobId: `handoff-photos-job:${suffix}`,
          commercialOrderId: order.id,
          createdByUserId: user.id,
          storeId: store.id,
          tenantId: tenant.id,
        },
      })
      await db.serviceJobLine.create({
        data: {
          allocatedQuantity: "1",
          allocationSnapshot: { fixture: "service-handoff-photos" },
          authorizationPolicy: "ON_ORDER_CONFIRMATION",
          authorizationSource: "order_confirmation",
          authorizationStatus: "AUTHORIZED",
          authorizedAt: new Date(),
          commercialOrderLineId: orderLine.id,
          serviceJobId: job.id,
          status: "READY_FOR_HANDOFF",
        },
      })
      const actor = { actorUserId: user.id, tenantId: tenant.id }

      // Completed but unpaid: the hand-over comes after completion.
      const completed = await completeServiceJob(db, {
        ...actor,
        clientCommandId: `complete:${suffix}`,
        expectedRevision: job.revision,
        jobId: job.id,
        storeId: store.id,
      })
      expect(completed.summary).toBe("completed")
      expect(completed.handedOffAt).toBeNull()
      expect(completed.balanceDueMinor).toBe(200_000)

      const handoff = {
        ...actor,
        clientCommandId: `handoff:${suffix}`,
        expectedRevision: completed.revision,
        jobId: job.id,
        method: "delivered" as const,
      }
      // Unpaid needs the exact owed amount confirmed, never a guess.
      await expect(recordServiceHandoff(db, handoff)).rejects.toThrow(
        "Collect the outstanding balance",
      )
      await expect(
        recordServiceHandoff(db, {
          ...handoff,
          acceptOutstandingBalanceMinor: 100_000,
        }),
      ).rejects.toThrow("still owed changed")
      expect(
        (await db.serviceJob.findUniqueOrThrow({ where: { id: job.id } }))
          .handedOffAt,
      ).toBeNull()

      const accepted = { ...handoff, acceptOutstandingBalanceMinor: 200_000 }
      const handed = await recordServiceHandoff(db, accepted)
      expect(handed.handedOffAt).toBeInstanceOf(Date)
      expect(handed.balanceDueMinor).toBe(200_000)
      expect(handed.paymentStatus).toBe("PENDING")

      // A retry of the same command replays without a second hand-over.
      const replay = await recordServiceHandoff(db, accepted)
      expect(replay.handedOffAt).toEqual(handed.handedOffAt)
      // Another hand-over is refused.
      await expect(
        recordServiceHandoff(db, {
          ...accepted,
          clientCommandId: `handoff-again:${suffix}`,
          expectedRevision: handed.revision,
        }),
      ).rejects.toThrow("already handed over")
      const events = await db.serviceWorkEvent.findMany({
        where: { serviceJobId: job.id, type: "REMOTE_HANDOFF" },
      })
      expect(events).toHaveLength(1)
      expect(events[0]?.reason).toBe("Delivered to customer")
      expect(events[0]?.actorUserId).toBe(user.id)
      expect(events[0]?.payload).toMatchObject({
        balanceOwedMinor: 200_000,
        method: "delivered",
      })
      expect(
        await db.commercialOrderPayment.count({ where: { orderId: order.id } }),
      ).toBe(0)

      const read = await getServiceJob(db, { jobId: job.id, tenantId })
      expect(read?.handoff).toMatchObject({
        balanceOwedMinor: 200_000,
        byName: "Ada Handover",
        byUserId: user.id,
        method: "delivered",
      })

      // A private photo: promised bytes first, then the verified upload.
      const photo = {
        ...actor,
        clientEvidenceId: `photo:${suffix}`,
        contentDigest: "a".repeat(64),
        contentType: "image/jpeg",
        jobId: job.id,
        label: "Stain before washing",
        purpose: "exception" as const,
        sizeBytes: 2_048,
      }
      const started = await startServiceEvidencePhotoUpload(db, photo)
      expect(started.uploadStatus).toBe("QUEUED")
      expect(started.visibility).toBe("PRIVATE")
      expect((await startServiceEvidencePhotoUpload(db, photo)).id).toBe(
        started.id,
      )
      await expect(
        startServiceEvidencePhotoUpload(db, {
          ...photo,
          contentDigest: "b".repeat(64),
        }),
      ).rejects.toThrow("different file")
      expect(
        await markServiceEvidencePhotoUploaded(db, {
          ...actor,
          evidenceId: started.id,
          storagePath: `services/evidence/${tenantId}/${job.id}/${started.id}/${"a".repeat(64)}.jpg`,
          storageProvider: "local_test",
          storageStoreId: null,
        }),
      ).toBe(true)
      const stored = await db.serviceEvidence.findUniqueOrThrow({
        where: { id: started.id },
      })
      expect(stored.uploadStatus).toBe("AVAILABLE")
      expect(stored.visibility).toBe("PRIVATE")
      expect(stored.safePublicAssetId).toBeNull()
      // Without the trusted safety check it can never reach the customer.
      await expect(
        publishServiceEvidence(db, { ...actor, evidenceId: started.id }),
      ).rejects.toThrow("safety-reviewed")
      const withPhoto = await getServiceJob(db, { jobId: job.id, tenantId })
      expect(withPhoto?.evidence[0]).toMatchObject({
        customerSafe: false,
        hasFile: true,
        visibility: "PRIVATE",
      })
    } finally {
      if (tenantId)
        await db.$transaction(
          async (tx) => {
            await tx.serviceJob.deleteMany({ where: { tenantId } })
            await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
            await tx.commercialServiceFulfillment.deleteMany({
              where: { tenantId },
            })
            await tx.commercialOrder.deleteMany({ where: { tenantId } })
            await tx.catalogItem.deleteMany({ where: { tenantId } })
            await tx.tenant.delete({ where: { id: tenantId } })
          },
          { timeout: 30000 },
        )
      await db.user.delete({ where: { id: user.id } })
    }
  }, 300000)
})
