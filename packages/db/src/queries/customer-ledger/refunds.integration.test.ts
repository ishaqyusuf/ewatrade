import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { getFinanceAccountBalances } from "../finance/reads"
import { ensureCustomerLedgerAccount } from "./accounts"
import { applyCustomerLedgerCredit } from "./allocations"
import { recordCustomerLedgerOpening } from "./opening"
import { getCustomerLedgerStatement } from "./reads"
import { recordCustomerLedgerReceipt } from "./receipts"
import { refundCustomerLedgerCredit } from "./refunds"

describeWithServiceCommerceDatabase("return unused customer funds", () => {
  test("partial refunds and competing returns consume only unused credit atomically", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const user = await db.user.create({
      data: {
        name: "Held refund QA",
        email: `held-refund-${runId}@example.invalid`,
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          name: "Held refund QA",
          slug: `held-refund-${runId}`,
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
      const customer = await db.customer.create({
        data: { tenantId, name: "Refund customer" },
      })
      const account = await ensureCustomerLedgerAccount(db, {
        ...actor,
        customerId: customer.id,
        currencyCode: "NGN",
      })
      const cash = await db.financeAccount.findFirstOrThrow({
        where: { bookId, code: "1000" },
      })
      const debt = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: account.id,
        direction: "DEBT",
        amountMinor: "10000",
        reason: "Verified external starting debt",
        clientCommandId: "opening-debt",
      })
      const receipt = await recordCustomerLedgerReceipt(db, {
        ...actor,
        bookId,
        accountId: account.id,
        moneyAccountId: cash.id,
        method: "CASH",
        amountMinor: "5000",
        description: "Deposit received",
        clientCommandId: "deposit",
      })
      const receiptSource = await db.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
      await applyCustomerLedgerCredit(db, {
        ...actor,
        bookId,
        accountId: account.id,
        creditEntryId: receiptSource.entryId,
        chargeEntryId: debt.id,
        amountMinor: "2000",
        clientCommandId: "apply-to-debt",
        expectedRevision: "2",
      })
      const statement = (snapshotSequence?: string) =>
        getCustomerLedgerStatement(db, {
          ...actor,
          accountId: account.id,
          snapshotSequence,
        })
      const before = await statement()
      expect(before.totals.outstandingDebtMinor).toBe("8000")
      expect(before.totals.availableCreditMinor).toBe("3000")
      const refund = {
        ...actor,
        bookId,
        accountId: account.id,
        creditEntryId: receiptSource.entryId,
        moneyAccountId: cash.id,
        method: "CASH" as const,
        amountMinor: "1000",
        clientCommandId: "partial-refund",
        expectedRevision: "3",
        reason: "Customer requested unused funds",
        reference: "RF-1",
        effectiveAt: new Date(),
      }
      const unpostedCredit = await db.customerLedgerEntry.create({
        data: {
          tenantId,
          accountId: account.id,
          sequence: BigInt(4),
          kind: "RECEIPT",
          side: "CREDIT",
          amountMinor: BigInt(1000),
          sourceKind: "CUSTOMER_RECEIPT",
          sourceId: randomUUID(),
          actorUserId: user.id,
          effectiveAt: refund.effectiveAt,
          description: "Unposted import fixture",
        },
      })
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          creditEntryId: unpostedCredit.id,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await db.customerLedgerEntry.update({
        where: { id: unpostedCredit.id },
        data: { sourceId: receipt.id, sourceKind: "QA_MISMATCHED_RECEIPT" },
      })
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          creditEntryId: unpostedCredit.id,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await db.customerLedgerEntry.delete({ where: { id: unpostedCredit.id } })
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          creditEntryId: "other-customer-credit",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          effectiveAt: new Date(Date.now() + 60000),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        refundCustomerLedgerCredit(db, { ...refund, method: "BANK_TRANSFER" }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        refundCustomerLedgerCredit(db, { ...refund, amountMinor: "3001" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        refundCustomerLedgerCredit(db, { ...refund, expectedRevision: "2" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        refundCustomerLedgerCredit(db, { ...refund, tenantId: "other-tenant" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          effectiveAt: new Date("2026-01-02"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: new Date(Date.now() + 60000) },
      })
      await expect(
        refundCustomerLedgerCredit(db, refund),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect((await statement()).snapshotSequence).toBe("3")
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: account.id, kind: "REFUND" },
        }),
      ).toBe(0)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: null },
      })
      const returned = await refundCustomerLedgerCredit(db, refund)
      expect(await refundCustomerLedgerCredit(db, refund)).toEqual(returned)
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          reason: "Changed retry details",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const afterPartial = await statement()
      expect(afterPartial.snapshotSequence).toBe("4")
      expect(afterPartial.totals.outstandingDebtMinor).toBe("8000")
      expect(afterPartial.totals.availableCreditMinor).toBe("2000")
      expect(afterPartial.totals.netBalanceMinor).toBe("6000")
      const command = await db.customerLedgerCommand.findUniqueOrThrow({
        where: {
          tenantId_clientCommandId: {
            tenantId,
            clientCommandId: refund.clientCommandId,
          },
        },
      })
      expect(command.result).toEqual({
        id: returned.id,
        audit: {
          creditEntryId: receiptSource.entryId,
          moneyAccountId: cash.id,
          method: "CASH",
          reference: "RF-1",
          reason: refund.reason,
          effectiveAt: refund.effectiveAt.toISOString(),
          amountMinor: "1000",
        },
      })
      const results = await Promise.allSettled(
        ["remaining-a", "remaining-b"].map((clientCommandId) =>
          refundCustomerLedgerCredit(db, {
            ...refund,
            clientCommandId,
            expectedRevision: "4",
            amountMinor: "2000",
            effectiveAt: new Date(),
          }),
        ),
      )
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1)
      const rejected = results.find((result) => result.status === "rejected")
      expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
        "CONFLICT",
      )
      const after = await statement()
      expect(after.snapshotSequence).toBe("5")
      expect(after.totals.outstandingDebtMinor).toBe("8000")
      expect(after.totals.availableCreditMinor).toBe("0")
      expect(after.totals.netBalanceMinor).toBe("8000")
      expect((await statement("3")).totals).toEqual(before.totals)
      expect(await refundCustomerLedgerCredit(db, refund)).toEqual(returned)
      await expect(
        refundCustomerLedgerCredit(db, {
          ...refund,
          clientCommandId: "over-refund",
          expectedRevision: "5",
          amountMinor: "1",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const balances = await getFinanceAccountBalances(db, { ...actor, bookId })
      const balance = (purpose: string) =>
        balances.accounts.find((row) => row.purpose === purpose)?.balanceMinor
      expect(balance("CASH")).toBe("2000")
      expect(balance("RECEIVABLE")).toBe("8000")
      expect(balance("CUSTOMER_ADVANCE")).toBe("0")
      expect(balance("SALES")).toBe("0")
      const entries = await db.customerLedgerEntry.findMany({
        where: { accountId: account.id, kind: "REFUND" },
        include: { chargesPaid: true },
      })
      expect(entries).toHaveLength(2)
      expect(
        entries.every(
          (entry) =>
            entry.chargesPaid.length === 1 &&
            entry.chargesPaid[0]?.sequence === entry.sequence &&
            entry.chargesPaid[0]?.amountMinor === entry.amountMinor,
        ),
      ).toBe(true)
    } finally {
      if (tenantId)
        await db.$transaction(
          async (tx) => {
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
            await tx.tenant.delete({ where: { id: tenantId } })
          },
          { maxWait: 10000, timeout: 30000 },
        )
      await db.user.delete({ where: { id: user.id } })
    }
  }, 180000)
})
