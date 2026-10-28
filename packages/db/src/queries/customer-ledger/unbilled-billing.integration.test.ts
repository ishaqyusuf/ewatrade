import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { refundCommercialOrder } from "../commercial-order-credits"
import {
  recordCommercialOrderPayment,
  recordCommercialOrderPaymentInTransaction,
} from "../commercial-payments"
import { createFinanceBook } from "../finance/accounts"
import { postCommerceFinanceJournalInTransaction } from "../finance/posting"
import { getCustomerLedgerAccountDetail } from "./account-reads"
import { ensureCustomerLedgerAccount } from "./accounts"
import { releaseCustomerLedgerAllocation } from "./allocation-releases"
import { recordCustomerLedgerReceipt } from "./receipts"
import { applyUnbilledCustomerCreditInTransaction } from "./unbilled-credit"

function assertFixture(
  value: { slug: string; dataClassification: string } | null,
  slug: string,
) {
  if (value?.slug !== slug || value.dataClassification !== "QA")
    throw new Error("Refusing non-fixture cleanup")
}

describeWithServiceCommerceDatabase(
  "unbilled credit to billed mixed-tender lifecycle",
  () => {
    test("billing reclassifies custody once and original source releases/refunds retain debt, credit and cash", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const user = await db.user.create({
        data: {
          name: "Billing reclass QA",
          email: `billing-reclass-${runId}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "Billing reclass QA",
            slug: `billing-reclass-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const actor = { tenantId, actorUserId: user.id }
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01"),
        })
        bookId = book.id
        const store = await db.store.create({
          data: {
            tenantId,
            name: "Billing reclass store",
            slug: "billing-reclass",
            status: "ACTIVE",
          },
        })
        const customer = await db.customer.create({
          data: { tenantId, name: "Billing reclass customer" },
        })
        const account = await ensureCustomerLedgerAccount(db, {
          ...actor,
          customerId: customer.id,
          currencyCode: "NGN",
        })
        const order = await db.commercialOrder.create({
          data: {
            tenantId,
            storeId: store.id,
            customerId: customer.id,
            clientOrderId: runId,
            payloadHash: "billing-reclass-fixture",
            orderNumber: "BILL-QA",
            currencyCode: "NGN",
            subtotalMinor: 10000,
            totalMinor: 10000,
            status: "CONFIRMED",
            createdByUserId: user.id,
          },
        })
        const bank = await db.financeAccount.findFirstOrThrow({
          where: { bookId, code: "1100" },
        })
        const receipt = await recordCustomerLedgerReceipt(db, {
          ...actor,
          bookId,
          accountId: account.id,
          moneyAccountId: bank.id,
          clientCommandId: "held",
          amountMinor: "10000",
          method: "BANK_TRANSFER",
          description: "Isolated held funds",
        })
        const credit = await db.customerLedgerReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
        })
        const revision = async () =>
          (
            await db.customerLedgerAccount.findUniqueOrThrow({
              where: { id: account.id },
              select: { revision: true },
            })
          ).revision.toString()
        const allocation = await db.$transaction(
          (tx) =>
            applyUnbilledCustomerCreditInTransaction(tx, {
              ...actor,
              bookId: book.id,
              accountId: account.id,
              creditEntryId: credit.entryId,
              orderId: order.id,
              expectedRevision: "1",
              clientCommandId: "unbilled-credit",
              amountMinor: "5000",
            }),
          { maxWait: 10_000, timeout: 30_000 },
        )
        // Prebilling partial return: its released amount must not be reapplied at billing.
        await releaseCustomerLedgerAllocation(db, {
          ...actor,
          bookId,
          accountId: account.id,
          allocationId: allocation.id,
          expectedRevision: await revision(),
          clientCommandId: "prebilling-release",
          amountMinor: "2000",
          reason: "Reduce held credit use",
        })
        await recordCommercialOrderPayment(db, {
          ...actor,
          orderId: order.id,
          clientPaymentId: "unbilled-cash",
          amountMinor: 2000,
          method: "bank_transfer",
          moneyAccountId: bank.id,
          reference: "QA-MIXED-CASH",
        })
        const detail = () =>
          getCustomerLedgerAccountDetail(db, {
            ...actor,
            accountId: account.id,
          })
        expect((await detail()).totals).toMatchObject({
          outstandingDebtMinor: "0",
          availableCreditMinor: "7000",
        })
        const bill = () =>
          db.$transaction(
            (tx) =>
              postCommerceFinanceJournalInTransaction(tx, {
                tenantId: tenant.id,
                orderId: order.id,
                event: "BILLED",
              }),
            { maxWait: 10_000, timeout: 30_000 },
          )
        await bill()
        expect((await detail()).totals).toMatchObject({
          outstandingDebtMinor: "5000",
          availableCreditMinor: "7000",
        })
        const paymentCount = await db.commercialOrderPayment.count({
          where: { tenantId, orderId: order.id },
        })
        const journals = await db.financeJournalEntry.count({
          where: { bookId },
        })
        const ledgerEntries = await db.customerLedgerEntry.count({
          where: { accountId: account.id },
        })
        await bill()
        expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(
          journals,
        )
        expect(
          await db.customerLedgerEntry.count({
            where: { accountId: account.id },
          }),
        ).toBe(ledgerEntries)
        expect(
          await db.commercialOrderPayment.count({
            where: { tenantId, orderId: order.id },
          }),
        ).toBe(paymentCount)
        const release = {
          ...actor,
          bookId,
          accountId: account.id,
          allocationId: allocation.id,
          expectedRevision: await revision(),
          clientCommandId: "postbilling-release",
          amountMinor: "1000",
          reason: "Return part of the original credit",
        }
        const returned = await releaseCustomerLedgerAllocation(db, release)
        expect(await releaseCustomerLedgerAllocation(db, release)).toEqual(
          returned,
        )
        expect((await detail()).totals).toMatchObject({
          outstandingDebtMinor: "6000",
          availableCreditMinor: "8000",
        })
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(4000)
        await refundCommercialOrder(db, {
          ...actor,
          storeId: store.id,
          orderId: order.id,
          clientOperationId: "postbilling-cash-return",
          amountMinor: 1000,
          method: "bank_transfer",
          moneyAccountId: bank.id,
          reference: "QA-CASH-RETURN",
          reason: "Return only original cash",
          lowerTotal: false,
        })
        expect((await detail()).totals).toMatchObject({
          outstandingDebtMinor: "7000",
          availableCreditMinor: "8000",
        })
        await expect(
          db.$transaction(
            (tx) =>
              recordCommercialOrderPaymentInTransaction(tx, {
                ...actor,
                orderId: order.id,
                clientPaymentId: "reject-credit-as-cash",
                amountMinor: 2000,
                method: "bank_transfer",
                moneyAccountId: bank.id,
                type: "refund",
              }),
            { maxWait: 10_000, timeout: 30_000 },
          ),
        ).rejects.toThrow(
          "Cash refunds cannot include settlement from customer credit",
        )
        const balances = await db.$queryRaw<
          Array<{ code: string; balance: bigint }>
        >`
        SELECT account.code, COALESCE(SUM(line."debitMinor" - line."creditMinor"),0)::bigint AS balance
        FROM "FinanceAccount" account LEFT JOIN "FinanceJournalLine" line ON line."accountId" = account.id AND line."bookId" = account."bookId"
        WHERE account."bookId" = ${book.id} GROUP BY account.id, account.code
      `
        const balance = (code: string) =>
          balances.find((row) => row.code === code)?.balance ?? 0n
        expect(balance("1100")).toBe(11000n)
        expect(balance("1200")).toBe(7000n)
        expect(balance("2100")).toBe(-8000n)
        expect(balance("2200")).toBe(0n)
        const [invalid] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT journal.id FROM "FinanceJournalEntry" journal JOIN "FinanceJournalLine" line ON line."entryId" = journal.id AND line."bookId" = journal."bookId"
          WHERE journal."bookId" = ${book.id} GROUP BY journal.id HAVING SUM(line."debitMinor") <> SUM(line."creditMinor")
        ) invalid
      `
        expect(invalid?.count).toBe(0n)
        expect(
          await db.financeJournalEntry.count({
            where: { bookId, sourceKind: "COMMERCIAL_ORDER_COLLECTION" },
          }),
        ).toBe(1)
      } finally {
        if (tenantId) {
          const fixture = await db.tenant.findUnique({
            where: { id: tenantId },
            select: { slug: true, dataClassification: true },
          })
          assertFixture(fixture, `billing-reclass-${runId}`)
          await db.$transaction(
            async (tx) => {
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
        await db.user.delete({ where: { id: user.id } })
      }
    }, 180_000)
  },
)
