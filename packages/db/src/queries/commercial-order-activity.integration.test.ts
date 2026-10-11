import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  addCommercialOrderActivity,
  listCommercialOrderActivity,
  markCommercialOrderAttachmentUploaded,
  readCommercialOrderAttachment,
} from "./commercial-order-activity"
import { createCommercialOrder } from "./commercial-orders"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
;(enabled ? describe : describe.skip)(
  "order activity on guarded Neon development",
  () => {
    test("adds notes and photos, is idempotent and hides other businesses", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const id = randomUUID()
      const tenantId = randomUUID()
      const userId = randomUUID()
      try {
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `order-activity-${id}`,
            name: "Order activity QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "order-activity.test",
            qaMarkedAt: new Date(),
          },
        })
        await prisma.user.create({
          data: { id: userId, email: `order-activity-${id}@example.test` },
        })
        await prisma.membership.create({
          data: { role: "OWNER", status: "ACTIVE", tenantId, userId },
        })
        const store = await prisma.store.create({
          data: { name: "Main", slug: `main-${id}`, tenantId },
        })
        const order = await createCommercialOrder(prisma, {
          actorUserId: userId,
          clientOrderId: `order-activity-${id}`,
          lines: [{ amountMinor: 1_000, custom: "quick_sale" }],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        })
        const scope = { tenantId }
        const input = {
          actorUserId: userId,
          attachments: [
            {
              contentDigest: "a".repeat(64),
              contentType: "image/jpeg",
              kind: "IMAGE" as const,
              sizeBytes: 2_048,
            },
          ],
          body: " Customer paid by transfer ",
          clientActivityId: `activity-${id}`,
          orderId: order.id,
          scope,
          tenantId,
        }
        const added = await addCommercialOrderActivity(prisma, input)
        expect(added.body).toBe("Customer paid by transfer")
        expect(added.attachments).toHaveLength(1)
        expect(added.attachments[0]?.status).toBe("PENDING_UPLOAD")
        // Same identity, same content: replay returns the same entry.
        expect((await addCommercialOrderActivity(prisma, input)).id).toBe(
          added.id,
        )
        await expect(
          addCommercialOrderActivity(prisma, { ...input, body: "Changed" }),
        ).rejects.toThrow("different content")
        await expect(
          addCommercialOrderActivity(prisma, {
            ...input,
            attachments: [],
            body: "  ",
            clientActivityId: `empty-${id}`,
          }),
        ).rejects.toThrow("Write a note")

        const attachmentId = added.attachments[0]?.id ?? ""
        const row = await readCommercialOrderAttachment(prisma, {
          attachmentId,
          scope,
          tenantId,
        })
        expect(row.orderId).toBe(order.id)
        await expect(
          readCommercialOrderAttachment(prisma, {
            attachmentId,
            scope: { tenantId: randomUUID() },
            tenantId: randomUUID(),
          }),
        ).rejects.toThrow("Attachment not found")
        const uploaded = {
          attachmentId,
          storagePath: "orders/attachments/x.jpg",
          storageProvider: "local_test",
          storageStoreId: null,
          tenantId,
        }
        expect(
          await markCommercialOrderAttachmentUploaded(prisma, uploaded),
        ).toBe(true)
        expect(
          await markCommercialOrderAttachmentUploaded(prisma, uploaded),
        ).toBe(false)

        const listed = await listCommercialOrderActivity(prisma, {
          orderId: order.id,
          scope,
          tenantId,
        })
        expect(listed).toHaveLength(1)
        expect(listed[0]?.attachments[0]?.status).toBe("READY")
      } finally {
        await prisma.tenant.deleteMany({ where: { id: tenantId } })
        await prisma.user.deleteMany({ where: { id: userId } })
        await prisma.$disconnect()
      }
    })
  },
)
