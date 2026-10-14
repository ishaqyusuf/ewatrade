import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { getActiveTenantForUser } from "@ewatrade/db/queries"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import type { GeneralContext } from "./general-context"
import { generalProposalForApp } from "./general-proposals"

// Smallest valid JPEG signature for the byte check.
const RECEIPT = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
])

const enabled = process.env.RUN_SIMPLE_TRANSFER_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)
;(enabled ? describe : describe.skip)(
  "simple transfer on Neon Development",
  () => {
    test("records transfers once, creates/reuses destination, retains photos without Orders", async () => {
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
      let tenantId: string | undefined
      let photoTarget: ReturnType<typeof setupAttachmentTarget> | undefined
      let userId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `simple-transfer-${marker}@example.test`,
            name: "Simple Transfer QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `simple-transfer-${marker}`,
            name: "Simple Transfer QA",
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
            token: `simple-transfer-${marker}`,
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
        photoTarget = setupAttachmentTarget(attachment)
        const { storagePath } = await setupAttachmentStorage("QA").stage({
          bytes: RECEIPT,
          target: setupAttachmentTarget(attachment),
        })
        await db.assistantAttachment.update({
          data: { storagePath, storageProvider: "local_test" },
          where: { id: attachment.id },
        })
        const book = await db.financeBook.create({
          data: {
            tenantId,
            currencyCode: tenant.currencyCode,
            timezone: "Africa/Lagos",
            startsAt: new Date("2026-01-01T00:00:00Z"),
            createdById: user.id,
            accounts: {
              create: [
                {
                  code: "1000",
                  name: "Shop cash",
                  kind: "ASSET",
                  purpose: "CASH",
                },
                {
                  code: "2000",
                  name: "Accounts payable",
                  kind: "LIABILITY",
                  purpose: "PAYABLE",
                },
                {
                  code: "6000",
                  name: "Operating expenses",
                  kind: "EXPENSE",
                  purpose: "OPERATING_EXPENSE",
                },
              ],
            },
          },
        })
        const { handleSimpleTransferChat } = await import(
          "./general-simple-transfer-chat"
        )
        const send = (text: string, imageIds: string[] = []) =>
          handleSimpleTransferChat(ctx, {
            conversationId: conversation.id,
            messageId: `transfer_${randomUUID()}`,
            text,
            imageIds,
            history: [],
          })
        expect((await send("transfer receipt"))?.text).toBe("How much?")
        expect((await send("5k"))?.text).toBe(
          "Which account is it moving from?",
        )
        expect((await send("Shop cash"))?.text).toBe(
          "Which account is it going to?",
        )
        const drafted = await send("to Transfer QA Bank", [attachment.id])
        if (!drafted?.proposalId) throw Error("Transfer draft missing")
        expect(drafted.text).toContain("Proceed or change anything?")
        expect(
          await db.financeAccount.count({
            where: { bookId: book.id, name: "Transfer QA Bank" },
          }),
        ).toBe(0)
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(0)
        await send("amount 6k")
        const saved = await send("proceed")
        expect(saved?.text).toContain("₦6,000.00")
        const completed = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: drafted.proposalId },
        })
        expect(completed.payload).toMatchObject({
          action: "money_transfer_simple",
          amountMinor: 600000,
          note: "",
          attachmentIds: [attachment.id],
        })
        const app = generalProposalForApp(completed)
        if (app.receipt?.kind !== "finance_movement")
          throw Error("Missing movement receipt")
        const entry = await db.financeJournalEntry.findUniqueOrThrow({
          where: { id: app.receipt.recordId },
          include: { lines: true },
        })
        const destination = await db.financeAccount.findFirstOrThrow({
          where: { bookId: book.id, name: "Transfer QA Bank" },
        })
        const cash = await db.financeAccount.findFirstOrThrow({
          where: { bookId: book.id, code: "1000" },
        })
        expect(entry.sourceKind).toBe("TRANSFER")
        expect(entry.actorUserId).toBe(user.id)
        expect(entry.description).toBe("Money moved")
        expect(entry.lines).toHaveLength(2)
        expect(
          entry.lines.find((l) => l.accountId === destination.id)?.debitMinor,
        ).toBe(600000n)
        expect(
          entry.lines.find((l) => l.accountId === cash.id)?.creditMinor,
        ).toBe(600000n)
        expect(
          entry.lines.reduce((v, l) => v + l.debitMinor - l.creditMinor, 0n),
        ).toBe(0n)
        expect((await send("proceed"))?.text).toBe("Already recorded.")
        expect(
          await db.financeJournalEntry.count({
            where: { bookId: book.id, sourceKind: "TRANSFER" },
          }),
        ).toBe(1)
        const reused = await send("move 1k from shop cash to transfer qa bank")
        if (!reused?.proposalId) throw Error("Reuse missing")
        expect(
          (
            await db.assistantActionProposal.findUniqueOrThrow({
              where: { id: reused.proposalId },
            })
          ).payload,
        ).toMatchObject({ toMoneyAccountId: destination.id, attachmentIds: [] })
        await send("proceed")
        expect(
          await db.financeAccount.count({
            where: { bookId: book.id, name: "Transfer QA Bank" },
          }),
        ).toBe(1)
        expect(
          await db.financeJournalEntry.count({
            where: { bookId: book.id, sourceKind: "TRANSFER" },
          }),
        ).toBe(2)
        await expect(
          send("move 1k from Shop cash to Shop cash"),
        ).rejects.toBeDefined()
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
        expect(await db.financeBill.count({ where: { bookId: book.id } })).toBe(
          0,
        )
      } finally {
        if (photoTarget)
          await setupAttachmentStorage("QA").remove({ target: photoTarget })
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              const books = await tx.financeBook.findMany({
                where: { tenantId },
                select: { id: true },
              })
              const bookIds = books.map((book) => book.id)
              await tx.financeBillPayment.deleteMany({
                where: { bookId: { in: bookIds } },
              })
              await tx.financeBillLine.deleteMany({
                where: { bookId: { in: bookIds } },
              })
              await tx.financeBill.deleteMany({
                where: { bookId: { in: bookIds } },
              })
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
