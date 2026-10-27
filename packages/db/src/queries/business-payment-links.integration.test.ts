import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  createBusinessPaymentLink,
  createManualBankAccount,
  manualPaymentReportStatus,
  prepareManualPaymentReport,
  readManualPaymentReport,
  reviewManualPaymentReport,
  submitManualPaymentReport,
} from "./business-payment-links"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { createFinanceBookInTransaction } from "./finance/accounts"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
class Rollback extends Error {}
// Same transaction-reuse adapter as the scoped-staff API middleware; the root
// commands join the already-owned test transaction, and every fixture rolls back.
function repositoryClient(tx: Prisma.TransactionClient): PrismaClient {
  return new Proxy(tx, {
    get(target, key) {
      if (key === "$transaction")
        return async (
          run: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => run(tx)
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as PrismaClient
}
;(enabled ? test : test.skip)(
  "manual claims never post; merchant rejection/partial confirmation/replay preserve canonical money and tenant scope (rollback)",
  async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../client")
    await prisma
      .$transaction(
        async (tx) => {
          const nonce = randomUUID()
          const tenantId = `manual-${nonce}`
          const userId = `manual-user-${nonce}`
          await tx.tenant.create({
            data: {
              id: tenantId,
              slug: tenantId,
              name: "Manual payment QA",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              currencyCode: "NGN",
              timezone: "Africa/Lagos",
              dataClassification: "QA",
              qaSourceDomain: "manual-payments.test",
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
          const actor = { tenantId, actorUserId: userId }
          const book = await createFinanceBookInTransaction(tx, {
            ...actor,
            startsAt: new Date(Date.now() - 86400_000),
          })
          const db = repositoryClient(tx)
          const account = await createManualBankAccount(db, {
            ...actor,
            bookId: book.id,
            clientAccountId: "bank-test-123",
            name: "GTBank receiving",
            bankName: "GTBank",
            accountNumber: "0123456789",
            accountHolder: "QA Business",
          })
          const order = await createCommercialOrderInTransaction(tx, {
            ...actor,
            clientOrderId: `order-${nonce}`,
            schemaVersion: 1,
            storeId: store.id,
            lines: [
              {
                custom: "quick_sale",
                description: "Manual test sale",
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
            clientLinkId: "link-test-123",
            allowPartial: true,
            now,
            expiresAt: new Date(now.getTime() + 3600_000),
          })
          const proof = { linkId: link.link.id, expiresAt: link.link.expiresAt }
          const first = await prepareManualPaymentReport(db, {
            ...proof,
            clientReportId: "report-test-1",
            payerName: "Ishaq Yusuf",
            claimedAmountMinor: 5000,
          })
          expect(
            await tx.commercialOrderPayment.count({
              where: { orderId: order.id },
            }),
          ).toBe(0)
          const submitted = await submitManualPaymentReport(db, {
            reportId: first.report.id,
          })
          expect(submitted.report.status).toBe("SUBMITTED")
          expect(
            (await manualPaymentReportStatus(db, first.report.id)).state,
          ).toBe("checking")
          await expect(
            readManualPaymentReport(db, {
              reportId: first.report.id,
              scope: { tenantId: "other" },
            }),
          ).rejects.toThrow("unavailable")
          await expect(
            prepareManualPaymentReport(db, {
              ...proof,
              clientReportId: "report-test-2",
              payerName: "Ishaq",
              claimedAmountMinor: 5000,
            }),
          ).rejects.toThrow("already being checked")
          const rejected = await reviewManualPaymentReport(db, {
            ...actor,
            reportId: first.report.id,
            expectedRevision: 2,
            outcome: "not_received",
            note: "No credit found yet.",
          })
          expect(rejected.report.status).toBe("NOT_RECEIVED")
          expect(
            await tx.commercialOrderPayment.count({
              where: { orderId: order.id },
            }),
          ).toBe(0)
          const next = await prepareManualPaymentReport(db, {
            ...proof,
            clientReportId: "report-test-3",
            payerName: "Ishaq",
            claimedAmountMinor: 5000,
          })
          await submitManualPaymentReport(db, { reportId: next.report.id })
          const receivedAt = new Date(Date.now() - 60_000)
          const decision = {
            ...actor,
            reportId: next.report.id,
            expectedRevision: 2,
            outcome: "received" as const,
            receivedAmountMinor: 4000,
            moneyAccountId: account.id,
            receivedAt,
            reference: "verified-credit",
          }
          await expect(
            reviewManualPaymentReport(db, { ...decision, expectedRevision: 1 }),
          ).rejects.toThrow("changed")
          await expect(
            reviewManualPaymentReport(db, { ...decision, tenantId: "other" }),
          ).rejects.toThrow("unavailable")
          await expect(
            reviewManualPaymentReport(db, {
              ...decision,
              moneyAccountId: "foreign-account",
            }),
          ).rejects.toThrow("active cash or bank account")
          const approved = await reviewManualPaymentReport(db, decision)
          expect(approved.report.receivedAmountMinor).toBe(4000)
          expect((await reviewManualPaymentReport(db, decision)).replay).toBe(
            true,
          )
          await expect(
            reviewManualPaymentReport(db, {
              ...decision,
              receivedAmountMinor: 5000,
            }),
          ).rejects.toThrow("reviewed differently")
          expect(
            await tx.commercialOrderPayment.count({
              where: { orderId: order.id },
            }),
          ).toBe(1)
          const payment = await tx.commercialOrderPayment.findUniqueOrThrow({
            where: { id: approved.report.canonicalPaymentId ?? "" },
          })
          expect(payment.recordedAt.getTime()).toBe(receivedAt.getTime())
          expect(payment.amountMinor).toBe(4000)
          const journal = await tx.financeJournalEntry.findUniqueOrThrow({
            where: {
              bookId_sourceKind_sourceId: {
                bookId: book.id,
                sourceKind: "COMMERCIAL_ORDER_COLLECTION",
                sourceId: payment.id,
              },
            },
          })
          expect(journal.effectiveAt.getTime()).toBe(receivedAt.getTime())
          expect(
            await manualPaymentReportStatus(db, next.report.id),
          ).toMatchObject({
            state: "partially_paid",
            balanceMinor: 6000,
            claimedAmountMinor: 5000,
            receivedAmountMinor: 4000,
          })
          const last = await prepareManualPaymentReport(db, {
            ...proof,
            clientReportId: "report-test-4",
            payerName: "Ishaq",
            claimedAmountMinor: 6000,
          })
          await submitManualPaymentReport(db, { reportId: last.report.id })
          await expect(
            reviewManualPaymentReport(db, {
              ...decision,
              reportId: last.report.id,
              receivedAmountMinor: 6001,
            }),
          ).rejects.toThrow("exceeds")
          await reviewManualPaymentReport(db, {
            ...decision,
            reportId: last.report.id,
            receivedAmountMinor: 6000,
          })
          expect(
            await manualPaymentReportStatus(db, last.report.id),
          ).toMatchObject({ state: "paid", balanceMinor: 0 })
          expect(
            await tx.commercialOrderPayment.count({
              where: { orderId: order.id },
            }),
          ).toBe(2)
          throw new Rollback()
        },
        { maxWait: 10000, timeout: 110000 },
      )
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  },
)
