import { expect, test } from "bun:test"
import { randomBytes, randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  createBusinessPaymentLink,
  createManualBankAccount,
  prepareManualPaymentReport,
  reviewManualPaymentReport,
  submitManualPaymentReport,
} from "../business-payment-links"
import { createFinanceBook } from "../finance/accounts"
import { readManualPaymentFundsReview } from "../manual-payment-excess"
import { getCustomerLedgerAccountDetail } from "./account-reads"
import { ensureCustomerLedgerAccount } from "./accounts"
import { decryptCustomerRefundDestination } from "./funds-destination"

function assertFixture(
  value: { slug: string; dataClassification: string } | null,
  slug: string,
) {
  if (value?.slug !== slug || value.dataClassification !== "QA")
    throw new Error("Refusing non-fixture cleanup")
}

describeWithServiceCommerceDatabase(
  "manual report canonical excess conservation",
  () => {
    test("actual report review conserves R=A+E, creates an unreserved source-bound refund request and rolls back failed child composition", async () => {
      const { prisma: db } = await import("../../client")
      const nonce = randomUUID()
      const slug = `manual-excess-${nonce}`
      const ownerId = randomUUID()
      const customerUserId = randomUUID()
      const users = [
        {
          id: ownerId,
          email: `${slug}-owner@example.invalid`,
          name: "Manual excess QA owner",
          emailVerified: true,
        },
        {
          id: customerUserId,
          email: `${slug}-customer@example.invalid`,
          name: "Manual excess QA customer",
          emailVerified: true,
        },
      ]
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        await db.user.createMany({ data: users })
        const tenant = await db.tenant.create({
          data: {
            slug,
            name: "Manual excess QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            currencyCode: "NGN",
            timezone: "Africa/Lagos",
            dataClassification: "QA",
            users: {
              create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const actor = { tenantId: tenant.id, actorUserId: ownerId }
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01"),
        })
        bookId = book.id
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Manual excess QA store",
            slug: "manual-excess",
            status: "ACTIVE",
          },
        })
        const customer = await db.customer.create({
          data: {
            tenantId: tenant.id,
            name: "Manual excess customer",
            email: `${slug}-customer@example.invalid`,
            normalizedEmail: `${slug}-customer@example.invalid`,
          },
        })
        const account = await ensureCustomerLedgerAccount(db, {
          ...actor,
          customerId: customer.id,
          currencyCode: "NGN",
        })
        const bank = await createManualBankAccount(db, {
          ...actor,
          bookId: book.id,
          clientAccountId: `bank-${nonce}`,
          name: "Isolated QA receiving bank",
          bankName: "QA bank",
          accountNumber: "0123456789",
          accountHolder: "QA Business",
        })
        const order = await db.commercialOrder.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            customerId: customer.id,
            clientOrderId: nonce,
            payloadHash: "manual-excess-fixture",
            orderNumber: "QA-EXCESS",
            currencyCode: "NGN",
            subtotalMinor: 10000,
            totalMinor: 10000,
            status: "CONFIRMED",
            createdByUserId: ownerId,
          },
        })
        const now = new Date()
        const link = await createBusinessPaymentLink(db, {
          ...actor,
          orderId: order.id,
          storeId: store.id,
          bankAccountId: bank.id,
          clientLinkId: `link-${nonce}`,
          amountMinor: 10000,
          allowPartial: true,
          now,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
        })
        const session = await db.session.create({
          data: {
            userId: customerUserId,
            token: randomUUID(),
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        })
        const key = randomBytes(32).toString("base64")
        const destination = {
          bankName: "QA customer receiving bank",
          accountNumber: "1234567890",
          accountName: "QA customer",
        }
        const draft = await prepareManualPaymentReport(db, {
          linkId: link.link.id,
          expiresAt: link.link.expiresAt,
          paymentAttemptId: link.attempt.id,
          clientReportId: `report-${nonce}`,
          payerName: "QA customer",
          claimedAmountMinor: 15000,
          allocation: {
            allocationPreference: "REFUND",
            requestedApplyMinor: 10000,
            refundDestination: destination,
          },
          authenticatedUserId: customerUserId,
          authenticatedSessionId: session.id,
          destinationEncryptionKey: key,
        })
        expect(draft.report.status).toBe("DRAFT")
        expect(
          await db.commercialOrderPayment.count({
            where: { tenantId: tenant.id, orderId: order.id },
          }),
        ).toBe(0)
        expect(
          await db.customerLedgerReceipt.count({
            where: { accountId: account.id },
          }),
        ).toBe(0)
        const submitted = await submitManualPaymentReport(db, {
          reportId: draft.report.id,
          notificationDeliveryEnabled: false,
        })
        expect(submitted.report.status).toBe("SUBMITTED")
        const snapshot = await readManualPaymentFundsReview(db, {
          ...actor,
          reportId: draft.report.id,
        })
        if (!snapshot)
          throw new Error(
            "A real source-derived customer funds review is required",
          )
        const decision = {
          ...actor,
          reportId: draft.report.id,
          expectedRevision: submitted.report.revision,
          outcome: "received" as const,
          receivedAmountMinor: 15000,
          moneyAccountId: bank.id,
          receivedAt: new Date(),
          reference: "998877665544332211009988776655",
          bankCheckAttested: true,
          transferReferenceNamespace: "nibss_session_id",
          allocationReview: { ...snapshot, orderAmountMinor: 10000 },
          destinationEncryptionKey: key,
        }
        const financeBefore = await db.financeJournalEntry.count({
          where: { bookId: book.id },
        })
        // The failed rewrap occurs after the canonical Order and held-receipt legs.
        // Their effects and the strong transfer consumption must all roll back.
        await expect(
          reviewManualPaymentReport(db, {
            ...decision,
            destinationEncryptionKey: randomBytes(32).toString("base64"),
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          await db.manualPaymentReport.findUniqueOrThrow({
            where: { id: draft.report.id },
          }),
        ).toMatchObject({
          status: "SUBMITTED",
          revision: submitted.report.revision,
          canonicalPaymentId: null,
          customerReceiptId: null,
          customerFundsRefundRequestId: null,
        })
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(0)
        expect(
          await db.commercialOrderPayment.count({
            where: { orderId: order.id },
          }),
        ).toBe(0)
        expect(
          await db.customerLedgerReceipt.count({
            where: { accountId: account.id },
          }),
        ).toBe(0)
        expect(
          await db.customerFundsRefundRequest.count({
            where: { accountId: account.id },
          }),
        ).toBe(0)
        expect(
          await db.manualPaymentTransferConsumption.count({
            where: { reportId: draft.report.id },
          }),
        ).toBe(0)
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(financeBefore)
        expect(
          (
            await db.customerLedgerAccount.findUniqueOrThrow({
              where: { id: account.id },
            })
          ).revision.toString(),
        ).toBe(snapshot.expectedCustomerFundsRevision)
        const confirmed = await reviewManualPaymentReport(db, decision)
        expect(confirmed).toMatchObject({
          replay: false,
          report: { status: "CONFIRMED", receivedAmountMinor: 15000 },
        })
        const report = confirmed.report
        if (
          !report.canonicalPaymentId ||
          !report.customerReceiptId ||
          !report.customerCreditEntryId ||
          !report.customerFundsRefundRequestId
        )
          throw new Error(
            "Confirmed excess must persist all canonical financial identities",
          )
        const [payment, receipt, heldCredit, refund] = await Promise.all([
          db.commercialOrderPayment.findUniqueOrThrow({
            where: { id: report.canonicalPaymentId },
          }),
          db.customerLedgerReceipt.findUniqueOrThrow({
            where: { id: report.customerReceiptId },
            include: { entry: true },
          }),
          db.customerLedgerEntry.findUniqueOrThrow({
            where: { id: report.customerCreditEntryId },
          }),
          db.customerFundsRefundRequest.findUniqueOrThrow({
            where: { id: report.customerFundsRefundRequestId },
          }),
        ])
        expect(payment).toMatchObject({
          orderId: order.id,
          amountMinor: 10000,
          method: "BANK_TRANSFER",
          moneyAccountId: bank.id,
        })
        expect(receipt).toMatchObject({
          accountId: account.id,
          bookId: book.id,
          entryId: heldCredit.id,
          entry: { amountMinor: 5000n, kind: "RECEIPT", side: "CREDIT" },
        })
        expect(BigInt(payment.amountMinor) + heldCredit.amountMinor).toBe(
          15000n,
        )
        expect(refund).toMatchObject({
          tenantId: tenant.id,
          accountId: account.id,
          creditEntryId: heldCredit.id,
          amountMinor: 5000n,
          status: "REQUESTED",
          version: 1,
          requestedByUserId: ownerId,
          approvedAt: null,
          outgoingReference: null,
          refundEntryId: null,
        })
        expect(
          decryptCustomerRefundDestination(
            refund.destinationCiphertext,
            {
              tenantId: tenant.id,
              accountId: account.id,
              creditEntryId: heldCredit.id,
            },
            key,
          ),
        ).toEqual(destination)
        expect(() =>
          decryptCustomerRefundDestination(
            draft.report.refundDestinationCiphertext ?? "",
            {
              tenantId: tenant.id,
              accountId: account.id,
              creditEntryId: heldCredit.id,
            },
            key,
          ),
        ).toThrow()
        expect(
          (
            await getCustomerLedgerAccountDetail(db, {
              ...actor,
              accountId: account.id,
            })
          ).totals.availableCreditMinor,
        ).toBe("5000")
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(10000)
        expect(
          await db.financeJournalEntry.count({
            where: { bookId: book.id, sourceKind: "COMMERCIAL_ORDER_BILLED" },
          }),
        ).toBe(0)
        expect(
          await db.manualPaymentTransferConsumption.count({
            where: { reportId: report.id },
          }),
        ).toBe(1)
        const counts = async () => ({
          payments: await db.commercialOrderPayment.count({
            where: { orderId: order.id },
          }),
          receipts: await db.customerLedgerReceipt.count({
            where: { accountId: account.id },
          }),
          refunds: await db.customerFundsRefundRequest.count({
            where: { accountId: account.id },
          }),
          journals: await db.financeJournalEntry.count({
            where: { bookId: book.id },
          }),
        })
        const firstCounts = await counts()
        expect((await reviewManualPaymentReport(db, decision)).replay).toBe(
          true,
        )
        expect(await counts()).toEqual(firstCounts)
        await expect(
          reviewManualPaymentReport(db, {
            ...decision,
            receivedAmountMinor: 16000,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const [bankMovement] = await db.$queryRaw<
          Array<{ receivedMinor: bigint; returnedMinor: bigint }>
        >`
        SELECT COALESCE(SUM("debitMinor"),0)::bigint AS "receivedMinor", COALESCE(SUM("creditMinor"),0)::bigint AS "returnedMinor" FROM "FinanceJournalLine" WHERE "bookId" = ${book.id} AND "accountId" = ${bank.id}
      `
        expect(bankMovement).toEqual({
          receivedMinor: 15000n,
          returnedMinor: 0n,
        })
        const [invalid] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM (SELECT journal.id FROM "FinanceJournalEntry" journal JOIN "FinanceJournalLine" line ON line."entryId" = journal.id AND line."bookId" = journal."bookId" WHERE journal."bookId" = ${book.id} GROUP BY journal.id HAVING SUM(line."debitMinor") <> SUM(line."creditMinor")) invalid
      `
        expect(invalid?.count).toBe(0n)
      } finally {
        if (tenantId) {
          assertFixture(
            await db.tenant.findUnique({
              where: { id: tenantId },
              select: { slug: true, dataClassification: true },
            }),
            slug,
          )
          await db.$transaction(
            async (tx) => {
              await tx.manualPaymentTransferConsumption.deleteMany({
                where: { tenantId },
              })
              await tx.manualPaymentReport.deleteMany({
                where: { link: { tenantId } },
              })
              await tx.manualPaymentAttempt.deleteMany({ where: { tenantId } })
              await tx.manualPaymentLink.deleteMany({ where: { tenantId } })
              await tx.commercialOrderPayment.deleteMany({
                where: { tenantId },
              })
              await tx.customerFundsRefundRequest.deleteMany({
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
              if (bookId) {
                await tx.financeCommand.deleteMany({ where: { bookId } })
                await tx.financeJournalLine.deleteMany({ where: { bookId } })
                await tx.financeJournalEntry.deleteMany({ where: { bookId } })
                await tx.financeAccount.deleteMany({ where: { bookId } })
                await tx.financeBook.delete({ where: { id: bookId } })
              }
              await tx.commercialOrder.deleteMany({ where: { tenantId } })
              await tx.store.deleteMany({ where: { tenantId } })
              await tx.customer.deleteMany({ where: { tenantId } })
              await tx.tenant.delete({ where: { id: tenantId } })
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }
        await db.session.deleteMany({
          where: { userId: { in: users.map((row) => row.id) } },
        })
        await db.user.deleteMany({
          where: { OR: users.map((row) => ({ id: row.id, email: row.email })) },
        })
      }
    }, 180_000)
  },
)
