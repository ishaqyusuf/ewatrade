import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import {
  createCommercialOrder,
  getActiveTenantForUser,
  listCommercialOrderActivity,
} from "@ewatrade/db/queries"
import { createOrderAttachmentStorage } from "@ewatrade/private-media/order-attachments"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

// Smallest valid JPEG signature for the byte check.
const RECEIPT = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
])

const enabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" &&
  process.env.ASSISTANT_GENERAL_ENABLED === "true"
if (enabled) setDefaultTimeout(180_000)
;(enabled ? describe : describe.skip)(
  "assistant receipt attached to an order on Neon development",
  () => {
    test("drafts, reviews and confirms order_attachment_add, copying the file", async () => {
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
      let tenantId: string | undefined
      let userId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `receipt-${marker}@example.test`,
            name: "Receipt QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `receipt-${marker}`,
            name: "Receipt QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "receipt-attachment.test",
            qaMarkedAt: new Date(),
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: { tenantId, name: "QA Store", slug: "qa", status: "ACTIVE" },
        })
        const session = await db.session.create({
          data: {
            userId: user.id,
            token: `receipt-${marker}`,
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        })
        const tenantContext = await getActiveTenantForUser(db, {
          userId: user.id,
          tenantSlug: tenant.slug,
          storeId: store.id,
        })
        if (!tenantContext) throw Error("Fixture context missing")
        const ctx: GeneralContext = {
          db,
          session: { session, user },
          tenantContext,
          tenantSlug: tenant.slug,
          tenantId,
          activeStoreId: store.id,
          requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
          requestId: marker,
          cfRay: null,
          isInternalRequest: false,
          forcePrimary: false,
          origin: null,
          clientIp: null,
          privacyClientIp: null,
          userAgent: null,
          qaSessionScope: null,
        }
        const conversation = await db.assistantConversation.create({
          data: {
            ownerUserId: user.id,
            purpose: "GENERAL",
            status: "ACTIVE",
            storeId: store.id,
            tenantId,
          },
        })
        // A receipt the owner already sent in this chat.
        const contentDigest = createHash("sha256").update(RECEIPT).digest("hex")
        const attachment = await db.assistantAttachment.create({
          data: {
            actorUserId: user.id,
            contentDigest,
            contentType: "image/jpeg",
            conversationId: conversation.id,
            fileName: "receipt.jpg",
            kind: "IMAGE",
            messageId: `msg_${marker}`,
            retentionUntil: new Date(Date.now() + 86_400_000),
            sizeBytes: RECEIPT.byteLength,
            status: "READY",
            storeId: store.id,
            tenantId,
            uploadExpiresAt: new Date(Date.now() + 60_000),
          },
        })
        const { storagePath } = await setupAttachmentStorage("QA").stage({
          bytes: RECEIPT,
          target: setupAttachmentTarget(attachment),
        })
        await db.assistantAttachment.update({
          data: { storagePath, storageProvider: "local_test" },
          where: { id: attachment.id },
        })
        const order = await createCommercialOrder(db, {
          actorUserId: user.id,
          clientOrderId: `receipt-order-${marker}`,
          lines: [{ amountMinor: 5_000, custom: "quick_sale" }],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        })

        const draft = await draftGeneralProposal(ctx, conversation.id, {
          action: "order_attachment_add",
          attachmentId: attachment.id,
          note: "Supplier receipt",
          orderId: order.id,
        })
        const row = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: draft.proposalId },
        })
        const reviewed = await generalProposalWithReview(ctx, row)
        expect(reviewed.review?.[0]).toContain(
          `Attach receipt.jpg to ${order.orderNumber}`,
        )
        const app = generalProposalForApp(row)
        const result = await decideGeneralProposal(ctx, {
          approvalToken: app.approvalToken,
          decision: "confirm",
          proposalId: app.id,
          revision: app.revision,
        })
        expect(result.receipt).toMatchObject({
          kind: "order",
          orderId: order.id,
          title: "File attached",
        })

        const activity = await listCommercialOrderActivity(db, {
          orderId: order.id,
          scope: { tenantId },
          tenantId,
        })
        expect(activity).toHaveLength(1)
        expect(activity[0]).toMatchObject({
          body: "Supplier receipt",
          source: "assistant",
        })
        const copied = activity[0]?.attachments[0]
        expect(copied?.status).toBe("READY")
        const bytes = await createOrderAttachmentStorage("QA").read({
          target: {
            attachmentId: copied?.id ?? "",
            contentDigest,
            contentType: "image/jpeg",
            orderId: order.id,
            sizeBytes: RECEIPT.byteLength,
            tenantId,
          },
        })
        expect(Array.from(bytes)).toEqual(Array.from(RECEIPT))
      } finally {
        if (tenantId) await db.tenant.deleteMany({ where: { id: tenantId } })
        if (userId) await db.user.deleteMany({ where: { id: userId } })
        await db.$disconnect()
      }
    })
  },
)
