import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  generalReceiptSchema,
  simpleSaleAction,
  simpleSaleQuestions,
} from "@ewatrade/assistant/general/contracts"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalProposalWithReview } from "./general-proposals"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-sale-confirm")
beforeAll(() => fixture.setup(), 90_000)

/** Remove money dependencies only after proving the unique fixture owns every row. */
async function cleanupOwnedSale() {
  const { db, tenantId, storeId, userId } = fixture
  await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) {
        expect(await tx.financeBook.count({ where: { tenantId } })).toBe(0)
        expect(await tx.commercialOrder.count({ where: { tenantId } })).toBe(0)
        return
      }
      expect(tenant).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      for (const proposal of proposals)
        expect(proposal).toMatchObject({
          actorUserId: userId,
          storeId,
          conversationId: fixture.conversationId,
          action: "sale_record",
        })
      const keys = new Set(proposals.map((proposal) => proposal.idempotencyKey))
      const orders = await tx.commercialOrder.findMany({ where: { tenantId } })
      for (const order of orders) {
        expect(order).toMatchObject({ storeId, createdByUserId: userId })
        expect(keys.has(order.clientOrderId)).toBe(true)
      }
      const orderIds = orders.map((order) => order.id)
      const books = await tx.financeBook.findMany({ where: { tenantId } })
      for (const book of books)
        expect(book).toMatchObject({ createdById: userId, currencyCode: "NGN" })
      const bookIds = books.map((book) => book.id)
      const commands = await tx.financeCommand.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const command of commands) expect(command.actorUserId).toBe(userId)
      const entries = await tx.financeJournalEntry.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const entry of entries) expect(entry.actorUserId).toBe(userId)
      const activities = await tx.commercialOrderActivity.findMany({
        where: { tenantId },
      })
      for (const activity of activities) {
        expect(activity.actorUserId).toBe(userId)
        expect(orderIds).toContain(activity.orderId)
      }
      // This walk-in, photo-free journey cannot own customer-ledger or physical media rows.
      expect(await tx.customerLedgerEntry.count({ where: { tenantId } })).toBe(
        0,
      )
      expect(
        await tx.customerLedgerAccount.count({ where: { tenantId } }),
      ).toBe(0)
      expect(
        await tx.commercialOrderAttachment.count({ where: { tenantId } }),
      ).toBe(0)
      const payments = await tx.commercialOrderPayment.findMany({
        where: { tenantId },
      })
      for (const payment of payments) {
        expect(payment).toMatchObject({ storeId, recordedByUserId: userId })
        expect(orderIds).toContain(payment.orderId)
      }
      const events = await tx.businessActivityEvent.findMany({
        where: { tenantId },
      })
      for (const event of events) expect(event.actorUserId).toBe(userId)
      await tx.businessActivityEvent.deleteMany({
        where: { tenantId, id: { in: events.map((event) => event.id) } },
      })
      await tx.commercialOrderPayment.deleteMany({
        where: { tenantId, id: { in: payments.map((payment) => payment.id) } },
      })
      await tx.commercialOrderActivity.deleteMany({
        where: {
          tenantId,
          id: { in: activities.map((activity) => activity.id) },
        },
      })
      await tx.commercialOrder.deleteMany({
        where: { tenantId, id: { in: orderIds } },
      })
      await tx.financeCommand.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: commands.map((command) => command.id) },
        },
      })
      await tx.financeJournalLine.deleteMany({
        where: {
          bookId: { in: bookIds },
          entryId: { in: entries.map((entry) => entry.id) },
        },
      })
      await tx.financeJournalEntry.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: entries.map((entry) => entry.id) },
        },
      })
      await tx.financeAccount.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeBook.deleteMany({
        where: { tenantId, id: { in: bookIds } },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  if (enabled && fixture.db) {
    try {
      await cleanupOwnedSale()
    } catch (error) {
      // Preserve tenant/user/proposal/proof attribution if money cleanup is unverified.
      await fixture.db.$disconnect()
      throw new Error(
        `Owned sale cleanup failed; retained fixture ${fixture.tenantId}`,
        { cause: error },
      )
    }
  }
  await fixture.cleanup()
}, 90_000)

suite(
  "native simple-sale exact review and first-Book cash confirmation",
  () => {
    test("quoted Confirm bootstraps canonical cash once and distinct-ingress replay returns saved receipt without another run or effect", async () => {
      const { db, tenantId, storeId, userId } = fixture
      expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
      expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
      const review = await fixture.stagedProposal({
        text: "Record a cash sale of 125.00, walk-in customer",
        payload: simpleSaleAction.parse({
          action: "sale_record",
          accountName: "cash",
          method: "cash",
          receivedMinor: 12500,
          customerChoice: "walk_in",
          description: "Synthetic cash counter sale",
        }),
        reply: "Review this saved sale draft.",
        expectedReviewText: "Shop cash",
      })
      const pending = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: review.source.proposalId },
      })
      expect(pending.payload).toMatchObject({
        accountName: "Shop cash",
        createAccount: true,
      })
      const canonical = await generalProposalWithReview(
        await fixture.context(`${fixture.marker}-review`),
        pending,
      )
      expect(canonical.question).toBe(simpleSaleQuestions.review)
      expect(canonical.approvalToken).toBeTruthy()
      expect(review.body).toContain("Create Book when confirmed")
      expect(review.body).toContain("Create account when confirmed")
      expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)

      const confirmed = await fixture.action(
        `Confirm ${review.confirmCode}`,
        review.providerMessageId,
      )
      expect(confirmed.inbox.content).toMatchObject({
        type: "action_result",
        resultRef: {
          proposalId: review.source.proposalId,
          revision: review.source.revision,
          status: "COMPLETED",
          decision: "confirm",
        },
      })
      const completed = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: pending.id },
      })
      expect(completed.status).toBe("COMPLETED")
      const receipt = generalReceiptSchema.parse(completed.executedResult)
      if (receipt.kind !== "order")
        throw Error("Expected canonical saved order receipt")
      expect(receipt.title).toBe("Sale saved")
      const order = await db.commercialOrder.findUniqueOrThrow({
        where: { id: receipt.recordId },
      })
      expect(order).toMatchObject({
        tenantId,
        storeId,
        createdByUserId: userId,
        clientOrderId: pending.idempotencyKey,
        totalMinor: 12500,
        amountPaidMinor: 12500,
        paymentStatus: "PAID",
        currencyCode: "NGN",
      })
      const book = await db.financeBook.findUniqueOrThrow({
        where: { tenantId_currencyCode: { tenantId, currencyCode: "NGN" } },
      })
      expect(book.createdById).toBe(userId)
      const cash = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "1000" } },
      })
      expect(cash).toMatchObject({
        name: "Shop cash",
        purpose: "CASH",
        kind: "ASSET",
      })
      const payments = await db.commercialOrderPayment.findMany({
        where: { tenantId },
      })
      expect(payments).toHaveLength(1)
      expect(payments[0]).toMatchObject({
        orderId: order.id,
        moneyAccountId: cash.id,
        method: "CASH",
        amountMinor: 12500,
        recordedByUserId: userId,
      })
      expect(
        await db.financeAccount.count({
          where: { bookId: book.id, name: "Shop cash" },
        }),
      ).toBe(1)
      expect(confirmed.outbox.content).toContain("Sale saved")
      expect(confirmed.outbox.content).toContain("125.00")
      const snapshot = async () => ({
        orders: await db.commercialOrder.count({ where: { tenantId } }),
        payments: await db.commercialOrderPayment.count({
          where: { tenantId },
        }),
        books: await db.financeBook.count({ where: { tenantId } }),
        accounts: await db.financeAccount.count({ where: { bookId: book.id } }),
        entries: await db.financeJournalEntry.count({
          where: { bookId: book.id },
        }),
        lines: await db.financeJournalLine.count({
          where: { bookId: book.id },
        }),
        commands: await db.financeCommand.count({ where: { bookId: book.id } }),
        runs: await db.assistantRun.count({
          where: { conversationId: fixture.conversationId },
        }),
      })
      const beforeReplay = await snapshot()
      expect(beforeReplay.orders).toBe(1)
      expect(beforeReplay.runs).toBe(1)
      expect(beforeReplay.entries).toBeGreaterThan(0)
      expect(beforeReplay.lines).toBeGreaterThan(0)
      const replay = await fixture.action(
        `Confirm ${review.confirmCode}`,
        review.providerMessageId,
      )
      expect(replay.inbox.id).not.toBe(confirmed.inbox.id)
      expect(replay.inbox.content).toEqual(confirmed.inbox.content)
      expect(replay.outbox.content).toBe(confirmed.outbox.content)
      expect(await snapshot()).toEqual(beforeReplay)
      expect(
        await db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: review.proof.id },
        }),
      ).toMatchObject({
        state: "CONSUMED",
        decision: "confirm",
        consumedByIngressId: confirmed.inbox.id,
      })
      expect(
        await db.commercialOrderActivity.count({ where: { tenantId } }),
      ).toBe(0)
      expect(await db.customer.count({ where: { tenantId } })).toBe(0)
      await fixture.assertNoStoredDecisionCodes()
    }, 240_000)
  },
)
