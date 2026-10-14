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

const enabled = process.env.RUN_SIMPLE_MONEY_IN_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)
;(enabled ? describe : describe.skip)(
  "simple money-in on Neon Development",
  () => {
    test("records funds without an Order, creates/reuses accounts and replays Proceed once", async () => {
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
      let tenantId: string | undefined
      let userId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `simple-money-${marker}@example.test`,
            name: "Simple Money QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `simple-money-${marker}`,
            name: "Simple Money QA",
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
            token: `simple-money-${marker}`,
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
        // Existing finance book fixture: testing money-in, not chart provisioning.
        await db.financeBook.create({
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
                  code: "1100",
                  name: "Bank account",
                  kind: "ASSET",
                  purpose: "BANK",
                },
                {
                  code: "3000",
                  name: "Owner capital",
                  kind: "EQUITY",
                  purpose: "CAPITAL",
                },
              ],
            },
          },
        })
        // Non-sale funding composes Finance only; no third Order or payment.
        const { handleSimpleMoneyInChat } = await import(
          "./general-simple-money-in-chat"
        )
        const moneySend = (text: string, imageIds: string[] = []) =>
          handleSimpleMoneyInChat(ctx, {
            conversationId: conversation.id,
            messageId: `money_${randomUUID()}`,
            text,
            imageIds,
            history: [],
          })
        const money = await moneySend("Put 20k into Money QA Bank account", [
          attachment.id,
        ])
        if (!money?.proposalId) throw Error("Money draft missing")
        expect(money.text).toContain("Proceed or change anything?")
        expect(
          await db.financeAccount.count({
            where: { book: { tenantId }, name: "Money QA Bank" },
          }),
        ).toBe(0)
        const moneyRow = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: money.proposalId },
        })
        expect(moneyRow.payload).toMatchObject({
          action: "money_in_record",
          amountMinor: 2000000,
          description: "",
          createAccount: true,
          attachmentIds: [attachment.id],
        })
        await moneySend("amount 25k")
        const moneySaved = await moneySend("proceed")
        expect(moneySaved?.text).toContain("₦25,000.00")
        const completed = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: money.proposalId },
        })
        const moneyApp = generalProposalForApp(completed)
        if (moneyApp.receipt?.kind !== "finance_movement")
          throw Error("Missing movement receipt")
        const entry = await db.financeJournalEntry.findUniqueOrThrow({
          where: { id: moneyApp.receipt.recordId },
          include: { lines: true },
        })
        expect(entry.sourceKind).toBe("OWNER_CONTRIBUTION")
        expect(entry.description).toBe("Money added")
        expect(entry.actorUserId).toBe(user.id)
        const newAccount = await db.financeAccount.findFirstOrThrow({
          where: { book: { tenantId }, name: "Money QA Bank" },
        })
        expect(
          entry.lines.find((line) => line.accountId === newAccount.id)
            ?.debitMinor,
        ).toBe(BigInt(2500000))
        expect((await moneySend("proceed"))?.text).toBe("Already recorded.")
        expect(
          await db.financeJournalEntry.count({
            where: { book: { tenantId }, sourceKind: "OWNER_CONTRIBUTION" },
          }),
        ).toBe(1)
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
        const reuse = await moneySend("Put 5k into money qa bank account")
        if (!reuse?.proposalId) throw Error("Reuse draft missing")
        const reuseRow = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: reuse.proposalId },
        })
        expect(reuseRow.payload).toMatchObject({
          moneyAccountId: newAccount.id,
          createAccount: false,
          attachmentIds: [],
        })
        await moneySend("proceed")
        expect(
          await db.financeAccount.count({
            where: { book: { tenantId }, name: "Money QA Bank" },
          }),
        ).toBe(1)
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
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
