import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { ensureCustomerLedgerAccount } from "../customer-ledger/accounts"
import { recordCustomerLedgerReceipt } from "../customer-ledger/receipts"
import { createFinanceBook } from "./accounts"
import { resolveFinanceBankCorrectionSource } from "./bank-correction-source"
import { recordFinanceExpense } from "./bills"
import { recordFinanceMoneyMovement } from "./money"
import { postFinanceJournalInTransaction } from "./posting"
import {
  createFinanceSupplier,
  recordFinanceSupplierAdvance,
  reverseFinanceSupplierEntry,
} from "./supplier-writes"

// All repository SQL executes in one owned transaction; the adapter only nests
// callbacks in that real transaction, and the sentinel rolls back every record.
function inside(tx: Prisma.TransactionClient) {
  return {
    $transaction: <T>(work: (value: Prisma.TransactionClient) => Promise<T>) =>
      work(tx),
  } as unknown as PrismaClient
}

describeWithServiceCommerceDatabase("bank source original ownership", () => {
  for (const family of [
    "money-expense",
    "supplier",
    "customer",
    "purchase-read",
  ] as const)
    test(`${family}: actual producer source identity and owned rollback`, async () => {
      const { prisma: db } = await import("../../client")
      const run = randomUUID()
      const email = `bank-source-${run}@example.invalid`
      const slug = `bank-source-${run}`
      const rollback = new Error(`Owned bank-source rollback ${run}`)
      let tenantId = ""
      let bookId = ""
      let userId = ""
      let customerId = ""
      try {
        await db.$transaction(
          async (tx) => {
            const nested = inside(tx)
            const user = await tx.user.create({
              data: { email, name: "Bank source QA" },
            })
            userId = user.id
            const tenant = await tx.tenant.create({
              data: {
                slug,
                name: "Bank source QA",
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
            const book = await createFinanceBook(nested, {
              ...actor,
              startsAt: new Date("2025-01-01T00:00:00.000Z"),
            })
            bookId = book.id
            const bank = await tx.financeAccount.findFirstOrThrow({
              where: { bookId, purpose: "BANK" },
            })
            const expense = await tx.financeAccount.findFirstOrThrow({
              where: { bookId, purpose: "OPERATING_EXPENSE" },
            })
            const clearing = await tx.financeAccount.findFirstOrThrow({
              where: { bookId, purpose: "CLEARING" },
            })
            const scope = { ...actor, bookId, accountId: bank.id }
            const resolve = (entryId: string) =>
              resolveFinanceBankCorrectionSource(nested, { ...scope, entryId })
            if (family === "money-expense") {
              await recordFinanceMoneyMovement(nested, {
                ...scope,
                clientCommandId: `${run}-capital`,
                kind: "OWNER_CONTRIBUTION",
                amountMinor: "10000",
                effectiveAt: new Date("2025-01-02T10:00:00.000Z"),
                description: "Owned original capital",
              })
              const capitalJournal =
                await tx.financeJournalEntry.findFirstOrThrow({
                  where: { bookId, sourceKind: "OWNER_CONTRIBUTION" },
                })
              expect((await resolve(capitalJournal.id)).target).toEqual({
                kind: "MONEY",
                entryId: capitalJournal.id,
              })
              await expect(
                resolveFinanceBankCorrectionSource(nested, {
                  ...scope,
                  bookId: randomUUID(),
                  entryId: capitalJournal.id,
                }),
              ).rejects.toMatchObject({ code: "NOT_FOUND" })
              await expect(
                resolveFinanceBankCorrectionSource(nested, {
                  ...scope,
                  accountId: clearing.id,
                  entryId: capitalJournal.id,
                }),
              ).rejects.toMatchObject({ code: "NOT_FOUND" })

              const bill = await recordFinanceExpense(nested, {
                ...actor,
                bookId,
                clientCommandId: `${run}-expense`,
                payeeName: "QA payee",
                description: "Owned expense",
                incurredAt: new Date("2025-01-03T10:00:00.000Z"),
                lines: [
                  {
                    accountId: expense.id,
                    description: "Owned expense line",
                    amountMinor: "100",
                  },
                ],
                payment: {
                  accountId: bank.id,
                  amountMinor: "100",
                  effectiveAt: new Date("2025-01-03T10:00:00.000Z"),
                },
              })
              const payment = await tx.financeBillPayment.findFirstOrThrow({
                where: { bookId, billId: bill.id },
              })
              const paymentJournal =
                await tx.financeJournalEntry.findFirstOrThrow({
                  where: {
                    bookId,
                    sourceKind: "BILL_PAYMENT",
                    sourceId: payment.id,
                  },
                })
              expect(payment.id).not.toBe(bill.id)
              expect((await resolve(paymentJournal.id)).target).toEqual({
                kind: "BILL",
                billId: bill.id,
                paymentId: payment.id,
              })
            }
            if (family === "purchase-read") {
              // This is an owned source-read fixture, not full purchase mutation acceptance.
              const at = new Date("2025-01-04T10:00:00.000Z")
              const supplier = await tx.financeSupplierAccount.create({
                data: {
                  bookId,
                  code: "PURCHASE-QA",
                  name: "Owned purchase supplier",
                  actorUserId: user.id,
                },
              })
              const payable = await tx.financeAccount.findFirstOrThrow({
                where: { bookId, purpose: "PAYABLE" },
              })
              const bill = await tx.financeBill.create({
                data: {
                  bookId,
                  supplierId: supplier.id,
                  kind: "PURCHASE",
                  payeeName: supplier.name,
                  description: "Owned source-read purchase",
                  incurredAt: at,
                  totalMinor: 200n,
                  paidMinor: 200n,
                  actorUserId: user.id,
                },
              })
              const payment = await tx.financeBillPayment.create({
                data: {
                  bookId,
                  billId: bill.id,
                  accountId: bank.id,
                  amountMinor: 200n,
                  effectiveAt: at,
                  actorUserId: user.id,
                },
              })
              await postFinanceJournalInTransaction(tx, {
                ...actor,
                bookId,
                clientCommandId: `${run}-purchase-source`,
                sourceKind: "PURCHASE_PAYMENT",
                sourceId: payment.id,
                description: "Owned original purchase payment",
                effectiveAt: at,
                lines: [
                  {
                    accountId: payable.id,
                    side: "DEBIT",
                    amountMinor: "200",
                  },
                  { accountId: bank.id, side: "CREDIT", amountMinor: "200" },
                ],
              })
              const journal = await tx.financeJournalEntry.findFirstOrThrow({
                where: {
                  bookId,
                  sourceKind: "PURCHASE_PAYMENT",
                  sourceId: payment.id,
                },
              })
              const source = await tx.financeSupplierEntry.create({
                data: {
                  bookId,
                  supplierId: supplier.id,
                  billId: bill.id,
                  paymentId: payment.id,
                  kind: "PURCHASE_PAYMENT",
                  side: "DEBIT",
                  amountMinor: 200n,
                  moneyAccountId: bank.id,
                  journalEntryId: journal.id,
                  effectiveAt: at,
                  actorUserId: user.id,
                  description: journal.description,
                },
              })
              expect(
                new Set([bill.id, payment.id, source.id, journal.id]).size,
              ).toBe(4)
              expect((await resolve(journal.id)).target).toEqual({
                kind: "PURCHASE",
                billId: bill.id,
                paymentId: payment.id,
                payment: {
                  id: payment.id,
                  supplierId: supplier.id,
                  amountMinor: "200",
                  effectiveAt: at,
                  description: journal.description,
                  reversed: false,
                  reversedAt: null,
                  reversalEffectiveAt: null,
                  latestEffectiveAt: at,
                },
              })
              const correctionAt = new Date("2025-01-05T12:30:00.123Z")
              await postFinanceJournalInTransaction(tx, {
                ...actor,
                bookId,
                clientCommandId: `${run}-purchase-reversal-source`,
                sourceKind: "PURCHASE_PAYMENT_REVERSAL",
                sourceId: source.id,
                reversalOfId: journal.id,
                description: "Owned original purchase reversal",
                effectiveAt: correctionAt,
                lines: [
                  { accountId: bank.id, side: "DEBIT", amountMinor: "200" },
                  {
                    accountId: payable.id,
                    side: "CREDIT",
                    amountMinor: "200",
                  },
                ],
              })
              const reverseJournal =
                await tx.financeJournalEntry.findFirstOrThrow({
                  where: { bookId, reversalOfId: journal.id },
                })
              await tx.financeSupplierEntry.create({
                data: {
                  bookId,
                  supplierId: supplier.id,
                  billId: bill.id,
                  kind: "REVERSAL",
                  side: "CREDIT",
                  amountMinor: 200n,
                  moneyAccountId: bank.id,
                  journalEntryId: reverseJournal.id,
                  reversalOfId: source.id,
                  effectiveAt: correctionAt,
                  actorUserId: user.id,
                  description: reverseJournal.description,
                },
              })
              // A legacy missing payment audit flag must still disable duplicate correction.
              expect((await resolve(reverseJournal.id)).target).toMatchObject({
                kind: "PURCHASE",
                paymentId: payment.id,
                payment: {
                  reversed: true,
                  reversedAt: null,
                  reversalEffectiveAt: correctionAt,
                  latestEffectiveAt: correctionAt,
                },
              })
              const before = await tx.financeBook.findUniqueOrThrow({
                where: { id: bookId },
                select: { lastSequence: true },
              })
              await resolve(journal.id)
              expect(
                (
                  await tx.financeBook.findUniqueOrThrow({
                    where: { id: bookId },
                    select: { lastSequence: true },
                  })
                ).lastSequence,
              ).toBe(before.lastSequence)
            }
            if (family === "supplier") {
              const supplier = await createFinanceSupplier(nested, {
                ...actor,
                bookId,
                clientCommandId: `${run}-supplier`,
                code: "OWNED",
                name: "Owned supplier",
              })
              const advance = await recordFinanceSupplierAdvance(nested, {
                ...actor,
                bookId,
                clientCommandId: `${run}-advance`,
                supplierId: supplier.id,
                moneyAccountId: bank.id,
                amountMinor: "200",
                description: "Owned supplier advance",
                effectiveAt: new Date("2025-01-04T10:00:00.000Z"),
              })
              const advanceEntry =
                await tx.financeSupplierEntry.findUniqueOrThrow({
                  where: { id: advance.id },
                })
              const original = await resolve(advanceEntry.journalEntryId)
              expect(original.target).toMatchObject({
                kind: "SUPPLIER",
                supplierEntryId: advance.id,
                supplierId: supplier.id,
                entryKind: "ADVANCE",
                reversal: null,
              })
              expect(original.posted.amountMinor).toBe("-200")
              const reversal = await reverseFinanceSupplierEntry(nested, {
                ...actor,
                bookId,
                clientCommandId: `${run}-reverse`,
                entryId: advance.id,
                reason: "Owned correction",
                effectiveAt: new Date("2025-01-05T10:00:00.000Z"),
              })
              const reversedEntry =
                await tx.financeSupplierEntry.findUniqueOrThrow({
                  where: { id: reversal.id },
                })
              const retained = await resolve(reversedEntry.journalEntryId)
              expect(retained.journalEntryId).toBe(reversedEntry.journalEntryId)
              expect(retained.target).toMatchObject({
                kind: "SUPPLIER",
                supplierEntryId: advance.id,
                reversal: { id: reversal.id },
              })
              expect(retained.posted.amountMinor).toBe("-200")
            }
            if (family === "customer") {
              const customer = await tx.customer.create({
                data: { tenantId, name: "Owned customer" },
              })
              customerId = customer.id
              const account = await ensureCustomerLedgerAccount(nested, {
                ...actor,
                customerId,
                currencyCode: tenant.currencyCode,
              })
              const receipt = await recordCustomerLedgerReceipt(nested, {
                ...actor,
                bookId,
                accountId: account.id,
                moneyAccountId: bank.id,
                clientCommandId: `${run}-receipt`,
                amountMinor: "300",
                method: "BANK_TRANSFER",
                description: "Owned customer receipt",
              })
              const receiptJournal =
                await tx.financeJournalEntry.findFirstOrThrow({
                  where: {
                    bookId,
                    sourceKind: "CUSTOMER_RECEIPT",
                    sourceId: receipt.id,
                  },
                })
              const storedReceipt =
                await tx.customerLedgerReceipt.findUniqueOrThrow({
                  where: { id: receipt.id },
                })
              expect((await resolve(receiptJournal.id)).target).toEqual({
                kind: "CUSTOMER",
                customerId,
                accountId: account.id,
                entryId: storedReceipt.entryId,
              })
              const snapshot = await tx.financeBook.findUniqueOrThrow({
                where: { id: bookId },
              })
              await resolve(receiptJournal.id)
              expect(
                (
                  await tx.financeBook.findUniqueOrThrow({
                    where: { id: bookId },
                  })
                ).lastSequence,
              ).toBe(snapshot.lastSequence)
              await tx.membership.updateMany({
                where: { tenantId, userId },
                data: { role: "MANAGER" },
              })
              await expect(resolve(receiptJournal.id)).rejects.toMatchObject({
                code: "FORBIDDEN",
              })
            }
            throw rollback
          },
          { maxWait: 10000, timeout: 30000, isolationLevel: "RepeatableRead" },
        )
      } catch (failure) {
        if (failure !== rollback) throw failure
      } finally {
        const counts = await Promise.all([
          db.user.count({ where: { email } }),
          db.tenant.count({ where: { slug } }),
          db.membership.count({ where: { tenantId, userId } }),
          db.financeBook.count({ where: { id: bookId } }),
          db.financeAccount.count({ where: { bookId } }),
          db.financeJournalEntry.count({ where: { bookId } }),
          db.financeJournalLine.count({ where: { bookId } }),
          db.financeCommand.count({ where: { bookId } }),
          db.financeBill.count({ where: { bookId } }),
          db.financeBillPayment.count({ where: { bookId } }),
          db.financeSupplierAccount.count({ where: { bookId } }),
          db.financeSupplierEntry.count({ where: { bookId } }),
          db.customer.count({ where: { id: customerId } }),
          db.customerLedgerAccount.count({ where: { tenantId } }),
          db.customerLedgerEntry.count({ where: { tenantId } }),
          db.customerLedgerCommand.count({ where: { tenantId } }),
          db.customerLedgerReceipt.count({ where: { bookId } }),
        ])
        for (const count of counts) expect(count).toBe(0)
        console.log(
          `Owned bank-source rollback: ${counts.length} cleanup checks passed.`,
        )
      }
    }, 90000)
})
