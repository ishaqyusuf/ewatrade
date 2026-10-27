import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  createBusinessPaymentLink,
  createManualBankAccount,
  prepareManualPaymentReport,
  reviewManualPaymentReport,
  submitManualPaymentReport,
} from "./business-payment-links"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { createFinanceBookInTransaction } from "./finance/accounts"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
function client(tx: Prisma.TransactionClient): PrismaClient {
  return new Proxy(tx, {
    get(target, key) {
      if (key === "$transaction")
        return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          run(tx)
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as PrismaClient
}
;(enabled ? test : test.skip)(
  "two real SQL sessions confirming one report create one canonical payment and replay one result",
  async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../client")
    const nonce = randomUUID()
    const tenantId = `manual-concurrency-${nonce}`
    const userId = `manual-concurrency-user-${nonce}`
    const actor = { tenantId, actorUserId: userId }
    let bookId: string | undefined
    try {
      const decision = await prisma.$transaction(
        async (tx) => {
          await tx.tenant.create({
            data: {
              id: tenantId,
              slug: tenantId,
              name: "Manual concurrency QA",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              currencyCode: "NGN",
              timezone: "Africa/Lagos",
              dataClassification: "QA",
              qaSourceDomain: "manual-concurrency.test",
              qaMarkedAt: new Date(),
            },
          })
          await tx.user.create({
            data: { id: userId, email: `${nonce}@example.test` },
          })
          await tx.membership.create({
            data: { tenantId, userId, role: "OWNER", status: "ACTIVE" },
          })
          const store = await tx.store.create({
            data: {
              tenantId,
              name: "Main",
              slug: `main-${nonce}`,
              status: "ACTIVE",
            },
          })
          const book = await createFinanceBookInTransaction(tx, {
            ...actor,
            startsAt: new Date(Date.now() - 86400_000),
          })
          bookId = book.id
          const db = client(tx)
          const account = await createManualBankAccount(db, {
            ...actor,
            bookId,
            clientAccountId: "concurrent-bank",
            name: "Synthetic bank",
            bankName: "GTBank",
            accountNumber: "0123456789",
            accountHolder: "QA Business",
          })
          const order = await createCommercialOrderInTransaction(tx, {
            ...actor,
            clientOrderId: nonce,
            schemaVersion: 1,
            storeId: store.id,
            lines: [
              {
                custom: "quick_sale",
                description: "Concurrent QA",
                amountMinor: 10000,
              },
            ],
          })
          const now = new Date()
          const link = await createBusinessPaymentLink(db, {
            ...actor,
            orderId: order.id,
            storeId: store.id,
            bankAccountId: account.id,
            clientLinkId: "concurrent-link",
            allowPartial: true,
            now,
            expiresAt: new Date(now.getTime() + 3600_000),
          })
          const report = await prepareManualPaymentReport(db, {
            linkId: link.link.id,
            expiresAt: link.link.expiresAt,
            clientReportId: "concurrent-report",
            payerName: "Synthetic payer",
            claimedAmountMinor: 5000,
          })
          await submitManualPaymentReport(db, { reportId: report.report.id })
          return {
            ...actor,
            reportId: report.report.id,
            orderId: order.id,
            expectedRevision: 2,
            outcome: "received" as const,
            receivedAmountMinor: 5000,
            moneyAccountId: account.id,
            receivedAt: new Date(),
            reference: "concurrent-credit",
          }
        },
        { maxWait: 10000, timeout: 120000 },
      )
      let ready = 0
      let release!: () => void
      const barrier = new Promise<void>((resolve) => {
        release = resolve
      })
      const sessions = new Set<number>()
      const run = () =>
        prisma.$transaction(
          async (tx) => {
            const [row] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`
            if (!row) throw new Error("SQL session identity missing")
            sessions.add(row.pid)
            ready++
            if (ready === 2) release()
            await barrier
            return reviewManualPaymentReport(client(tx), decision)
          },
          { maxWait: 10000, timeout: 120000 },
        )
      const results = await Promise.all([run(), run()])
      expect(sessions.size).toBe(2)
      expect(results.filter((result) => result.replay)).toHaveLength(1)
      expect(
        new Set(results.map((result) => result.report.canonicalPaymentId)).size,
      ).toBe(1)
      expect(
        await prisma.commercialOrderPayment.count({
          where: { tenantId, orderId: decision.orderId },
        }),
      ).toBe(1)
      expect(
        await prisma.commercialOrder.findUniqueOrThrow({
          where: { id: decision.orderId },
          select: { amountPaidMinor: true },
        }),
      ).toEqual({ amountPaidMinor: 5000 })
    } finally {
      // Only this run's newly created synthetic QA rows can be removed.
      await prisma.$transaction(
        async (tx) => {
          await tx.manualPaymentReport.deleteMany({
            where: { link: { tenantId } },
          })
          await tx.manualPaymentLink.deleteMany({ where: { tenantId } })
          await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
          await tx.commercialOrder.deleteMany({ where: { tenantId } })
          if (bookId) {
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.deleteMany({ where: { id: bookId, tenantId } })
          }
          await tx.tenant.deleteMany({
            where: {
              id: tenantId,
              dataClassification: "QA",
              qaSourceDomain: "manual-concurrency.test",
            },
          })
          await tx.user.deleteMany({
            where: { id: userId, email: `${nonce}@example.test` },
          })
        },
        { maxWait: 10000, timeout: 120000 },
      )
      expect(await prisma.tenant.count({ where: { id: tenantId } })).toBe(0)
    }
  },
  300000,
)
