import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import {
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
  generalProposalForApp,
} from "./general-proposals"

// Smallest valid JPEG signature for the byte check.
const RECEIPT = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
])

const enabled = process.env.RUN_SIMPLE_SALE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)
;(enabled ? describe : describe.skip)(
  "simple sale drafts, payment and optional activity image on Neon development",
  () => {
    test("completes chat/form drafts with and without images and replays save once", async () => {
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
      let tenantId: string | undefined
      let userId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `simple-sale-${marker}@example.test`,
            name: "Simple Sale QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `simple-sale-${marker}`,
            name: "Simple Sale QA",
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
            token: `simple-sale-${marker}`,
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
        const { handleSimpleSaleChat } = await import(
          "./general-simple-sale-chat"
        )
        const { editGeneralProposal } = await import("./general-proposals")
        const send = (
          text: string,
          images: string[] = [],
          history: Array<{ id: string; role: string; parts: unknown }> = [],
        ) =>
          handleSimpleSaleChat(ctx, {
            conversationId: conversation.id,
            messageId: randomUUID(),
            text,
            imageIds: images,
            history,
          })
        expect(await send("", [attachment.id])).toEqual({
          text: "What is this for?",
          proposalId: null,
        })
        const first = await send("Part paid by Salman", [attachment.id])
        expect(first?.proposalId).toBeTruthy()
        if (!first?.proposalId) throw Error("Missing draft")
        const draftId = first.proposalId
        const saved = () =>
          db.assistantActionProposal.findUniqueOrThrow({
            where: { id: draftId },
          })
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
        expect(
          generalProposalForApp(await saved()).approvalToken,
        ).toBeUndefined()
        await send("Ishaq PalmPay")
        await send("New customer")
        await send("35,000")
        const partial = generalProposalForApp(await saved())
        expect(partial.approvalToken).toBeUndefined()
        expect(partial.payload).toMatchObject({
          action: "sale_record",
          receivedMinor: 3500000,
          partial: true,
          attachmentIds: [attachment.id],
        })
        if (partial.payload.action !== "sale_record") throw Error("Wrong draft")
        await editGeneralProposal(ctx, {
          proposalId: draftId,
          revision: partial.revision,
          payload: { ...partial.payload, totalMinor: 10500000 },
        })
        // Back to chat after editing in the form: same draft and attachment.
        await send("paid 40,000")
        expect(
          await db.assistantActionProposal.count({
            where: { conversationId: conversation.id },
          }),
        ).toBe(1)
        const app = generalProposalForApp(await saved())
        const result = await decideGeneralProposal(ctx, {
          approvalToken: app.approvalToken,
          decision: "confirm",
          proposalId: app.id,
          revision: app.revision,
        })
        expect(result.receipt).toMatchObject({
          kind: "order",
          title: "Sale saved",
        })
        if (!result.receipt || result.receipt.kind !== "order")
          throw Error("Missing receipt")
        const orderId = result.receipt.recordId
        const order = await db.commercialOrder.findUniqueOrThrow({
          where: { id: orderId },
        })
        expect(order.totalMinor).toBe(10500000)
        expect(order.amountPaidMinor).toBe(4000000)
        expect(order.totalMinor - order.amountPaidMinor).toBe(6500000)
        const account = await db.financeAccount.findFirstOrThrow({
          where: { book: { tenantId }, name: "Ishaq PalmPay" },
        })
        const payments = await db.commercialOrderPayment.findMany({
          where: { orderId },
        })
        expect(payments).toHaveLength(1)
        expect(payments[0]?.moneyAccountId).toBe(account.id)
        const activity = await listCommercialOrderActivity(db, {
          orderId,
          scope: { tenantId },
          tenantId,
        })
        expect(activity).toHaveLength(1)
        expect(activity[0]?.attachments).toHaveLength(1)
        const copied = activity[0]?.attachments[0]
        if (!copied) throw Error("Missing copied image")
        expect(copied.status).toBe("READY")
        const bytes = await createOrderAttachmentStorage("QA").read({
          target: {
            attachmentId: copied.id,
            contentDigest,
            contentType: "image/jpeg",
            orderId,
            sizeBytes: RECEIPT.byteLength,
            tenantId,
          },
        })
        expect(Array.from(bytes)).toEqual(Array.from(RECEIPT))
        // Exact retry recovers the same receipt, with no second payment or image.
        expect(
          await decideGeneralProposal(ctx, {
            approvalToken: app.approvalToken,
            decision: "confirm",
            proposalId: app.id,
            revision: app.revision,
          }),
        ).toMatchObject({ id: app.id, receipt: result.receipt })
        expect(
          await db.commercialOrderPayment.count({ where: { orderId } }),
        ).toBe(1)
        expect(
          await db.financeAccount.count({
            where: { book: { tenantId }, name: "Ishaq PalmPay" },
          }),
        ).toBe(1)
        expect(
          await db.customer.count({ where: { tenantId, name: "Salman" } }),
        ).toBe(1)
        expect(
          await listCommercialOrderActivity(db, {
            orderId,
            scope: { tenantId },
            tenantId,
          }),
        ).toHaveLength(1)
        const second = await send("Sales Receipt")
        await send("ishaq palm pay")
        await send("Walk-in")
        await send("500")
        if (!second?.proposalId) throw Error("Missing second draft")
        const secondRow = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: second.proposalId },
        })
        const secondApp = generalProposalForApp(secondRow)
        expect(secondApp.payload).toMatchObject({
          action: "sale_record",
          moneyAccountId: account.id,
          createAccount: false,
          attachmentIds: [],
          customerChoice: "walk_in",
          receivedMinor: 50000,
        })
        const secondResult = await decideGeneralProposal(ctx, {
          proposalId: secondApp.id,
          revision: secondApp.revision,
          approvalToken: secondApp.approvalToken,
          decision: "confirm",
        })
        if (!secondResult.receipt || secondResult.receipt.kind !== "order")
          throw Error("Missing second receipt")
        expect(
          await listCommercialOrderActivity(db, {
            orderId: secondResult.receipt.recordId,
            scope: { tenantId },
            tenantId,
          }),
        ).toHaveLength(0)
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(2)
      } finally {
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              const books = await tx.financeBook.findMany({
                where: { tenantId },
                select: { id: true },
              })
              const bookIds = books.map((book) => book.id)
              await tx.commercialOrderPayment.deleteMany({
                where: { tenantId },
              })
              await tx.customerLedgerCommand.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAllocationRelease.deleteMany({
                where: { allocation: { credit: { tenantId } } },
              })
              await tx.customerLedgerAllocation.deleteMany({
                where: { credit: { tenantId } },
              })
              await tx.customerLedgerReceipt.deleteMany({
                where: { entry: { tenantId } },
              })
              await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
              await tx.commercialOrder.deleteMany({ where: { tenantId } })
              await tx.financeCommand.deleteMany({
                where: { bookId: { in: bookIds } },
              })
              await tx.financeJournalLine.deleteMany({
                where: { bookId: { in: bookIds } },
              })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId: { in: bookIds } },
              })
              await tx.financeAccount.deleteMany({
                where: { bookId: { in: bookIds } },
              })
              await tx.financeBook.deleteMany({ where: { tenantId } })
              await tx.tenant.deleteMany({ where: { id: tenantId } })
            },
            { maxWait: 10000, timeout: 30000 },
          )
        if (userId) await db.user.deleteMany({ where: { id: userId } })
        await db.$disconnect()
      }
    })
  },
)
