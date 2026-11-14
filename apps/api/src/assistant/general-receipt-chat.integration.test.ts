import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import {
  createCommercialOrder,
  createFinanceBookInTransaction,
  createFinanceMoneyAccountInTransaction,
  getActiveTenantForUser,
  listCommercialOrderActivity,
} from "@ewatrade/db/queries"
import type {
  ChatReceiptExtraction,
  ChatReceiptReadResult,
} from "@ewatrade/payments/chat-receipt"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"
import {
  decideReceiptApproval,
  listReceiptApprovals,
  openReceiptApproval,
} from "./general-receipt-approval"
import {
  handleReceiptChat,
  handleReceiptFollowUp,
} from "./general-receipt-chat"
import { ingestTelegramFile } from "./telegram-file"

// Smallest valid JPEG signature; the provider read is synthetic.
const RECEIPT = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
])
const env = {
  ...process.env,
  ASSISTANT_RECEIPT_QA_LIVE: "true",
  ASSISTANT_RECEIPT_OPENAI_API_KEY: "synthetic-never-called",
  APP_ENV: "local",
}
const read = (over: Partial<ChatReceiptExtraction>) => async () =>
  ({
    extraction: {
      amountText: "62,000.00",
      currencyCode: "NGN",
      senderName: "MUSA IBRAHIM",
      senderAccount: "012****789",
      senderBank: "Access Bank",
      recipientName: "RECEIPT QA STORES",
      recipientAccount: "0123454417",
      recipientBank: "GTBank",
      narration: null,
      bankReference: `REF${randomUUID().slice(0, 12)}`,
      dateRaw: "Today",
      dateTimeIso: null,
      documentKind: "transfer_receipt",
      printedStatus: "successful",
      ...over,
    },
    provider: "openai",
    model: "gpt-4.1-mini",
    providerRequestId: `resp_${randomUUID()}`,
    inputTokens: 1,
    outputTokens: 1,
  }) satisfies ChatReceiptReadResult

/** Every business this test made (QA, its own source domain), finance rows first. */
async function removeReceiptFixtures(
  db: typeof import("@ewatrade/db")["prisma"],
) {
  const tenants = await db.tenant.findMany({
    where: { dataClassification: "QA", qaSourceDomain: "chat-receipt.test" },
    select: { id: true },
  })
  for (const { id: tenantId } of tenants) {
    const books = await db.financeBook.findMany({
      where: { tenantId },
      select: { id: true },
    })
    const where = { bookId: { in: books.map((book) => book.id) } }
    await db.$transaction(
      async (tx) => {
        await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
        await tx.commercialOrder.deleteMany({ where: { tenantId } })
        await tx.financeBillPayment.deleteMany({ where })
        await tx.financeBillLine.deleteMany({ where })
        await tx.financeBill.deleteMany({ where })
        await tx.financeJournalLine.deleteMany({ where })
        await tx.financeJournalEntry.deleteMany({ where })
        await tx.financeCommand.deleteMany({ where })
        await tx.financePeriod.deleteMany({ where })
        await tx.financeAccount.deleteMany({ where })
        await tx.financeBook.deleteMany({ where: { tenantId } })
        await tx.tenant.delete({ where: { id: tenantId } })
      },
      { maxWait: 10_000, timeout: 60_000 },
    )
  }
}

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)
;(enabled ? describe : describe.skip)(
  "chat transfer receipts on Neon development",
  () => {
    test("match, ask, transfer, money out and duplicate, then confirm the payment", async () => {
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
      let tenantId: string | undefined
      let userId: string | undefined
      let cashierId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `chat-receipt-${marker}@example.test`,
            name: "Receipt QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `chat-receipt-${marker}`,
            name: "Receipt QA Stores",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            currencyCode: "NGN",
            metadata: { retailOps: { subscription: { planId: "pro" } } },
            dataClassification: "QA",
            qaSourceDomain: "chat-receipt.test",
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
            token: `chat-receipt-${marker}`,
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
        const actor = { tenantId, actorUserId: user.id }
        const { bank, bisi } = await db.$transaction(async (tx) => {
          const book = await createFinanceBookInTransaction(tx, {
            ...actor,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          })
          const bank = await createFinanceMoneyAccountInTransaction(tx, {
            ...actor,
            bookId: book.id,
            code: "RC_MAIN",
            name: "Main bank",
            purpose: "BANK",
          })
          const bisi = await createFinanceMoneyAccountInTransaction(tx, {
            ...actor,
            bookId: book.id,
            code: "RC_BISI",
            name: "Bisi Opay",
            purpose: "BANK",
          })
          return { bank, bisi }
        })
        await db.financeAccount.update({
          where: { id: bank.id },
          data: {
            bankName: "GTBank",
            bankAccountNumber: "0123454417",
            bankAccountHolder: "Receipt QA Stores",
          },
        })
        await db.financeAccount.update({
          where: { id: bisi.id },
          data: {
            bankName: "OPay",
            bankAccountNumber: "8100093051",
            bankAccountHolder: "Bisi Ojo",
          },
        })
        const conversation = await db.assistantConversation.create({
          data: {
            ownerUserId: user.id,
            purpose: "GENERAL",
            status: "ACTIVE",
            storeId: store.id,
            tenantId,
          },
        })
        const musa = await createCommercialOrder(db, {
          actorUserId: user.id,
          clientOrderId: `rc-musa-${marker}`,
          customerName: "Musa Ibrahim",
          lines: [
            {
              amountMinor: 6_200_000,
              custom: "quick_sale",
              description: "Rice 50kg",
            },
          ],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        })
        const chidi = await createCommercialOrder(db, {
          actorUserId: user.id,
          clientOrderId: `rc-chidi-${marker}`,
          customerName: "Chidi Eze",
          lines: [
            {
              amountMinor: 2_450_000,
              custom: "quick_sale",
              description: "Vegetable oil",
            },
          ],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        })
        const contentDigest = createHash("sha256").update(RECEIPT).digest("hex")
        let sent = 0
        async function receipt(
          owner: { userId: string; conversationId: string } = {
            userId: user.id,
            conversationId: conversation.id,
          },
        ) {
          sent += 1
          const row = await db.assistantAttachment.create({
            data: {
              actorUserId: owner.userId,
              contentDigest,
              contentType: "image/jpeg",
              conversationId: owner.conversationId,
              fileName: `receipt-${sent}.jpg`,
              kind: "IMAGE",
              messageId: `msg_${marker}_${sent}`,
              retentionUntil: new Date(Date.now() + 86_400_000),
              sizeBytes: RECEIPT.byteLength,
              status: "READY",
              storeId: store.id,
              tenantId: tenantId as string,
              uploadExpiresAt: new Date(Date.now() + 60_000),
            },
          })
          const { storagePath } = await setupAttachmentStorage("QA").stage({
            bytes: RECEIPT,
            target: setupAttachmentTarget(row),
          })
          return db.assistantAttachment.update({
            data: { storagePath, storageProvider: "local_test" },
            where: { id: row.id },
          })
        }
        const send = async (over: Partial<ChatReceiptExtraction>, text = "") =>
          handleReceiptChat(
            ctx,
            {
              conversationId: conversation.id,
              text,
              attachments: [await receipt()],
            },
            { env, read: read(over) },
          )
        const proposal = (id: string | undefined) =>
          db.assistantActionProposal.findUniqueOrThrow({ where: { id } })

        // 19a: the sender's name finds Musa's order, into the account on the receipt.
        const reference = `REF-${marker.slice(0, 8)}`
        const matched = await send({ bankReference: reference })
        expect(matched?.text).toContain(musa.orderNumber)
        const paymentRow = await proposal(matched?.proposalId)
        expect(paymentRow.payload).toMatchObject({
          action: "payment_record",
          orderId: musa.id,
          amountMinor: 6_200_000,
          moneyAccountId: bank.id,
          method: "bank_transfer",
        })
        expect(
          (paymentRow.payload as { receiptAttachmentId?: string })
            .receiptAttachmentId,
        ).toBeTruthy()
        const reviewed = await generalProposalWithReview(ctx, paymentRow)
        expect(reviewed.review?.join("\n")).toContain(
          "Received into: Main bank",
        )
        expect(reviewed.review?.join("\n")).toContain("MUSA IBRAHIM")
        const app = generalProposalForApp(paymentRow)
        const paid = await decideGeneralProposal(ctx, {
          approvalToken: app.approvalToken,
          decision: "confirm",
          proposalId: app.id,
          revision: app.revision,
        })
        expect(paid.receipt).toMatchObject({
          kind: "payment",
          orderId: musa.id,
        })
        const order = await db.commercialOrder.findUniqueOrThrow({
          where: { id: musa.id },
        })
        expect(order.paymentStatus).toBe("PAID")
        const activity = await listCommercialOrderActivity(db, {
          orderId: musa.id,
          scope: { tenantId },
          tenantId,
        })
        expect(activity[0]?.body).toBe("Payment receipt")
        expect(activity[0]?.attachments).toHaveLength(1)

        // 19i: the same bank reference again records nothing.
        const duplicate = await send({ bankReference: reference })
        expect(duplicate?.text).toContain("already recorded")
        expect(duplicate?.proposalId).toBeUndefined()

        // 19c: an unknown sender asks, and the typed name finds Chidi's order.
        const asked = await send({
          amountText: "24,500",
          senderName: "AMAKA EZE",
        })
        expect(asked?.text).toContain("What is it for?")
        const typed = await handleReceiptFollowUp(
          ctx,
          { conversationId: conversation.id, text: "chidi" },
          env,
        )
        expect((await proposal(typed?.proposalId)).payload).toMatchObject({
          action: "payment_record",
          orderId: chidi.id,
          amountMinor: 2_450_000,
        })

        // 19e: Bisi's account to Main bank is a transfer, not income.
        const transfer = await send({
          amountText: "180,000",
          senderName: "BISI OJO",
          senderAccount: "810****051",
          senderBank: "OPay",
          narration: "today sales",
        })
        expect((await proposal(transfer?.proposalId)).payload).toMatchObject({
          action: "money_transfer_simple",
          amountMinor: 18_000_000,
          fromMoneyAccountId: bisi.id,
          toMoneyAccountId: bank.id,
        })

        // 19f: money out with a remark is an expense; without one it asks.
        const expense = await send({
          amountText: "15,000",
          senderName: "RECEIPT QA STORES",
          senderAccount: "0123454417",
          recipientName: "IKEDI MOTORS",
          recipientAccount: "2099911111",
          recipientBank: "Zenith",
          narration: "transport goods",
        })
        expect((await proposal(expense?.proposalId)).payload).toMatchObject({
          action: "expense_record_simple",
          amountMinor: 1_500_000,
          moneyAccountId: bank.id,
          paid: true,
          payeeName: "IKEDI MOTORS",
        })
        const unclear = await send({
          amountText: "50,000",
          senderName: "RECEIPT QA STORES",
          senderAccount: "0123454417",
          recipientName: "ADAEZE OKAFOR",
          recipientAccount: "0457781234",
          recipientBank: "Access",
          narration: null,
        })
        expect(unclear?.text).toContain("What was it for?")

        // 19h: paid into an account that isn't the business's.
        const unknown = await send({
          amountText: "9,400",
          recipientName: "TUNDE BAKARE",
          recipientAccount: "0228812000",
        })
        expect(unknown?.text).toContain("isn't one of your accounts")

        // 19j: not a receipt continues the ordinary photo turn.
        expect(
          await send({ documentKind: "not_a_receipt", amountText: null }),
        ).toBeNull()
        expect(
          await send({ amountText: null, documentKind: "unreadable" }),
        ).toMatchObject({
          text: expect.stringContaining("can't read the amount"),
        })

        // Telegram: a sent photo and a PDF are stored as this chat's ready
        // attachments (download is synthetic), then read like any upload.
        const telegramCtx = { ...ctx, assistantConversationId: conversation.id }
        const PDF = new TextEncoder().encode(
          "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
        )
        for (const [contentType, bytes] of [
          ["image/jpeg", RECEIPT],
          ["application/pdf", PDF],
        ] as const) {
          const ingested = await ingestTelegramFile(
            telegramCtx as GeneralContext,
            { token: "synthetic" },
            {
              kind: "media",
              fileId: `file-${randomUUID()}`,
              fileUniqueId: `u-${contentType.length}-${marker.slice(0, 6)}`,
              contentType,
              fileName:
                contentType === "application/pdf" ? "r.pdf" : "photo.jpg",
              caption: null,
            },
            async () => bytes,
          )
          expect(ingested.kind).toBe("ready")
          const part =
            ingested.kind === "ready"
              ? ingested.parts.find((item) => item.type !== "text")
              : undefined
          const attachmentId = (part as { data: { attachmentId: string } }).data
            .attachmentId
          const stored = await db.assistantAttachment.findUniqueOrThrow({
            where: { id: attachmentId },
          })
          expect(stored).toMatchObject({
            status: "READY",
            kind: contentType === "application/pdf" ? "PDF" : "IMAGE",
          })
          sent += 1
          const reply = await handleReceiptChat(
            ctx,
            {
              conversationId: conversation.id,
              text: "",
              attachments: [stored],
            },
            {
              env,
              read: read({
                amountText: "1,000",
                senderName: "NOBODY KNOWN",
              }),
            },
          )
          expect(reply?.text).toContain("What is it for?")
        }

        const reads = await db.assistantReceiptRead.count({
          where: { tenantId },
        })
        expect(reads).toBe(sent)

        // 19l: a cashier can't record transfers; Ada (the owner) approves by link.
        const cashier = await db.user.create({
          data: {
            email: `chat-receipt-cashier-${marker}@example.test`,
            name: "Bisi Ojo",
            ageBand: "ADULT",
          },
        })
        cashierId = cashier.id
        await db.membership.create({
          data: { tenantId, userId: cashier.id, role: "CASHIER" },
        })
        const cashierSession = await db.session.create({
          data: {
            userId: cashier.id,
            token: `chat-receipt-cashier-${marker}`,
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        })
        const cashierTenant = await getActiveTenantForUser(db, {
          userId: cashier.id,
          tenantSlug: tenant.slug,
          storeId: store.id,
        })
        if (!cashierTenant) throw Error("Cashier context missing")
        const cashierCtx: GeneralContext = {
          ...ctx,
          session: { session: cashierSession, user: cashier },
          tenantContext: cashierTenant,
        }
        const till = await db.assistantConversation.create({
          data: {
            ownerUserId: cashier.id,
            purpose: "GENERAL",
            status: "ACTIVE",
            storeId: store.id,
            tenantId,
          },
        })
        const silent = {
          telegramConfig: () => null,
          enqueue: async () => undefined,
        }
        const fromBisi = async (amountText: string) =>
          handleReceiptChat(
            cashierCtx,
            {
              conversationId: till.id,
              text: "today sales",
              attachments: [
                await receipt({ userId: cashier.id, conversationId: till.id }),
              ],
            },
            {
              env,
              read: read({
                amountText,
                senderName: "BISI OJO",
                senderAccount: "810****051",
                senderBank: "OPay",
                narration: "today sales",
              }),
            },
          )
        const offered = await fromBisi("180,000")
        expect(offered?.proposalId).toBeUndefined()
        expect(offered?.text).toContain("Transfer to approve")
        expect(offered?.text).toContain("Receipt approves transfers")
        const asking = await handleReceiptFollowUp(
          cashierCtx,
          { conversationId: till.id, text: "ask" },
          env,
        )
        expect(asking?.text).toContain("Waiting for Receipt to approve")
        // The cashier can't open or approve it themselves.
        expect(await listReceiptApprovals(cashierCtx)).toEqual([])
        const waiting = await listReceiptApprovals(ctx)
        expect(waiting).toHaveLength(1)
        expect(waiting[0]).toMatchObject({
          requestedBy: "Bisi",
          kind: "transfer",
        })
        const requestId = waiting[0]?.id as string
        expect(await openReceiptApproval(cashierCtx, requestId)).toEqual({
          status: "forbidden",
        })
        const opened = await openReceiptApproval(ctx, requestId)
        if (opened.status !== "ready") throw Error(opened.status)
        expect(opened.proposal.payload).toMatchObject({
          action: "money_transfer_simple",
          amountMinor: 18_000_000,
          fromMoneyAccountId: bisi.id,
          toMoneyAccountId: bank.id,
        })
        expect(opened.facts.map((fact) => fact.label)).toContain("From")
        const approved = await decideReceiptApproval(
          ctx,
          {
            id: requestId,
            decision: "approve",
            proposalId: opened.proposal.id,
            revision: opened.proposal.revision,
            approvalToken: opened.proposal.approvalToken,
          },
          silent,
        )
        expect(approved.status).toBe("approved")
        expect(approved.proposal?.status).toBe("COMPLETED")
        await expect(
          decideReceiptApproval(
            ctx,
            {
              id: requestId,
              decision: "approve",
              proposalId: opened.proposal.id,
              revision: opened.proposal.revision,
              approvalToken: opened.proposal.approvalToken,
            },
            silent,
          ),
        ).rejects.toThrow()
        expect(await openReceiptApproval(ctx, requestId)).toMatchObject({
          status: "approved",
          decidedBy: "Receipt",
        })
        const told = await db.assistantMessage.findMany({
          where: { conversationId: till.id, role: "assistant" },
        })
        expect(JSON.stringify(told.at(-1)?.parts)).toContain(
          "Approved by Receipt",
        )
        expect(
          await db.assistantReceiptRead.findUniqueOrThrow({
            where: { id: requestId },
          }),
        ).toMatchObject({
          status: "APPROVED",
          approvalDecidedByUserId: user.id,
        })

        // Declined, and cancelled before asking: nothing is recorded.
        await fromBisi("40,000")
        await handleReceiptFollowUp(
          cashierCtx,
          { conversationId: till.id, text: "ask" },
          env,
        )
        const second = (await listReceiptApprovals(ctx))[0]?.id as string
        const reopened = await openReceiptApproval(ctx, second)
        if (reopened.status !== "ready") throw Error(reopened.status)
        expect(
          await decideReceiptApproval(
            ctx,
            {
              id: second,
              decision: "decline",
              proposalId: reopened.proposal.id,
              revision: reopened.proposal.revision,
            },
            silent,
          ),
        ).toMatchObject({ status: "declined" })
        expect((await proposal(reopened.proposal.id)).status).toBe("CANCELLED")
        await fromBisi("5,000")
        expect(
          await handleReceiptFollowUp(
            cashierCtx,
            { conversationId: till.id, text: "cancel" },
            env,
          ),
        ).toEqual({ text: "❌ Cancelled. Nothing was changed." })
        expect(await listReceiptApprovals(ctx)).toEqual([])
      } finally {
        await removeReceiptFixtures(db)
        if (cashierId) await db.user.deleteMany({ where: { id: cashierId } })
        if (userId) await db.user.deleteMany({ where: { id: userId } })
        await db.$disconnect()
      }
    })
  },
)
