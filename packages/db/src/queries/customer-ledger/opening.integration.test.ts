import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { getFinanceAccountBalances } from "../finance/reads"
import {
  getCustomerLedgerAccountDetail,
  listCustomerLedgerAccounts,
} from "./account-reads"
import { ensureCustomerLedgerAccount } from "./accounts"
import { releaseCustomerLedgerAllocation } from "./allocation-releases"
import { applyCustomerLedgerCredit } from "./allocations"
import { recordCustomerLedgerOpening } from "./opening"
import { getCustomerLedgerStatement } from "./reads"
import { recordCustomerLedgerReceipt } from "./receipts"
describeWithServiceCommerceDatabase("customer opening balances", () => {
  test("atomic opening debt/credit imports have no cash or revenue effect", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `customer-opening-${suffix}@example.invalid`,
        name: "Customer opening acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `customer-opening-${suffix}`,
          name: "Customer opening acceptance",
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
        data: { tenantId, name: "Opening customer" },
      })
      const account = await ensureCustomerLedgerAccount(db, {
        ...actor,
        customerId: customer.id,
        currencyCode: "NGN",
      })
      expect(
        (
          await ensureCustomerLedgerAccount(db, {
            ...actor,
            customerId: customer.id,
            currencyCode: "NGN",
          })
        ).id,
      ).toBe(account.id)
      const opening = {
        ...actor,
        bookId,
        accountId: account.id,
        clientCommandId: "opening-debt",
        direction: "DEBT" as const,
        amountMinor: "10000",
        reason: "Verified external opening debt, excluding existing orders",
      }
      const debt = await recordCustomerLedgerOpening(db, opening)
      expect(await recordCustomerLedgerOpening(db, opening)).toEqual(debt)
      await expect(
        recordCustomerLedgerOpening(db, { ...opening, amountMinor: "10001" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        recordCustomerLedgerOpening(db, {
          ...opening,
          clientCommandId: "duplicate-debt",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await recordCustomerLedgerOpening(db, {
        ...opening,
        clientCommandId: "opening-credit",
        direction: "CREDIT",
        amountMinor: "3000",
        reason: "Verified pre-existing customer funds",
      })
      const entries = await db.customerLedgerEntry.findMany({
        where: { accountId: account.id },
        orderBy: { sequence: "asc" },
      })
      expect(
        entries.map((entry) => [
          entry.kind,
          entry.side,
          entry.amountMinor.toString(),
        ]),
      ).toEqual([
        ["OPENING_DEBT", "DEBIT", "10000"],
        ["OPENING_CREDIT", "CREDIT", "3000"],
      ])
      const balances = await getFinanceAccountBalances(db, { ...actor, bookId })
      const balance = (purpose: string) =>
        balances.accounts.find((row) => row.purpose === purpose)?.balanceMinor
      expect(balance("RECEIVABLE")).toBe("10000")
      expect(balance("CUSTOMER_ADVANCE")).toBe("3000")
      expect(balance("OPENING_EQUITY")).toBe("7000")
      expect(balance("CASH")).toBe("0")
      expect(balance("SALES")).toBe("0")
      expect(
        (
          await db.customerLedgerAccount.findUniqueOrThrow({
            where: { id: account.id },
          })
        ).revision,
      ).toBe(BigInt(2))
      await expect(
        ensureCustomerLedgerAccount(db, {
          ...actor,
          customerId: "wrong-customer",
          currencyCode: "NGN",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const foreignCurrency = await ensureCustomerLedgerAccount(db, {
        ...actor,
        customerId: customer.id,
        currencyCode: "USD",
      })
      await expect(
        recordCustomerLedgerOpening(db, {
          ...opening,
          accountId: foreignCurrency.id,
          clientCommandId: "wrong-currency",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: foreignCurrency.id },
        }),
      ).toBe(0)
      await expect(
        recordCustomerLedgerOpening(db, {
          ...opening,
          tenantId: "wrong-tenant",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const cash = balances.accounts.find((row) => row.purpose === "CASH")
      const bank = balances.accounts.find((row) => row.purpose === "BANK")
      if (!cash || !bank) throw new Error("Missing money accounts")
      const receipt = {
        ...actor,
        bookId,
        accountId: account.id,
        moneyAccountId: cash.id,
        clientCommandId: "deposit",
        amountMinor: "5000",
        method: "CASH" as const,
        description: "Deposit held for future orders",
        reference: "QA receipt",
      }
      const saved = await recordCustomerLedgerReceipt(db, receipt)
      expect(await recordCustomerLedgerReceipt(db, receipt)).toEqual(saved)
      await expect(
        recordCustomerLedgerReceipt(db, { ...receipt, amountMinor: "5001" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        recordCustomerLedgerReceipt(db, {
          ...receipt,
          clientCommandId: "bad-method",
          moneyAccountId: bank.id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const after = await getFinanceAccountBalances(db, { ...actor, bookId })
      expect(
        after.accounts.find((row) => row.purpose === "CASH")?.balanceMinor,
      ).toBe("5000")
      expect(
        after.accounts.find((row) => row.purpose === "CUSTOMER_ADVANCE")
          ?.balanceMinor,
      ).toBe("8000")
      expect(
        after.accounts.find((row) => row.purpose === "RECEIVABLE")
          ?.balanceMinor,
      ).toBe("10000")
      expect(
        after.accounts.find((row) => row.purpose === "SALES")?.balanceMinor,
      ).toBe("0")
      expect(
        await db.customerLedgerReceipt.count({
          where: { accountId: account.id },
        }),
      ).toBe(1)
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: account.id },
        }),
      ).toBe(3)
      expect(
        await db.customerLedgerAllocation.count({
          where: { accountId: account.id },
        }),
      ).toBe(0)
      const receiptEntry = await db.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: saved.id },
      })
      const allocationInput = {
        ...actor,
        bookId,
        accountId: account.id,
        clientCommandId: "apply-deposit",
        expectedRevision: "3",
        creditEntryId: receiptEntry.entryId,
        chargeEntryId: debt.id,
        amountMinor: "4000",
      }
      const allocation = await applyCustomerLedgerCredit(db, allocationInput)
      expect(await applyCustomerLedgerCredit(db, allocationInput)).toEqual(
        allocation,
      )
      await expect(
        applyCustomerLedgerCredit(db, {
          ...allocationInput,
          clientCommandId: "stale-review",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        applyCustomerLedgerCredit(db, {
          ...allocationInput,
          clientCommandId: "too-much-credit",
          expectedRevision: "4",
          amountMinor: "1001",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const allocatedBalances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      const allocatedBalance = (purpose: string) =>
        allocatedBalances.accounts.find((row) => row.purpose === purpose)
          ?.balanceMinor
      expect(allocatedBalance("RECEIVABLE")).toBe("6000")
      expect(allocatedBalance("CUSTOMER_ADVANCE")).toBe("4000")
      expect(allocatedBalance("CASH")).toBe("5000")
      expect(allocatedBalance("SALES")).toBe("0")
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: account.id },
        }),
      ).toBe(3)
      expect(
        await db.customerLedgerAllocation.count({
          where: { accountId: account.id },
        }),
      ).toBe(1)
      expect(
        (
          await db.customerLedgerAllocation.findUniqueOrThrow({
            where: { id: allocation.id },
          })
        ).sequence,
      ).toBe(BigInt(4))
      const releaseInput = {
        ...actor,
        bookId,
        accountId: account.id,
        clientCommandId: "release-deposit",
        expectedRevision: "4",
        allocationId: allocation.id,
        amountMinor: "1500",
        reason: "Customer requested a smaller debt settlement",
      }
      const release = await releaseCustomerLedgerAllocation(db, releaseInput)
      expect(await releaseCustomerLedgerAllocation(db, releaseInput)).toEqual(
        release,
      )
      await expect(
        releaseCustomerLedgerAllocation(db, {
          ...releaseInput,
          clientCommandId: "over-release",
          expectedRevision: "5",
          amountMinor: "2501",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const releaseBalances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      const releasedBalance = (purpose: string) =>
        releaseBalances.accounts.find((row) => row.purpose === purpose)
          ?.balanceMinor
      expect(releasedBalance("RECEIVABLE")).toBe("7500")
      expect(releasedBalance("CUSTOMER_ADVANCE")).toBe("5500")
      expect(releasedBalance("CASH")).toBe("5000")
      expect(releasedBalance("SALES")).toBe("0")
      expect(
        (
          await db.customerLedgerAllocationRelease.findUniqueOrThrow({
            where: { id: release.id },
          })
        ).sequence,
      ).toBe(BigInt(5))
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: account.id },
        }),
      ).toBe(3)
      const competing = await Promise.allSettled(
        ["a", "b"].map((suffix) =>
          applyCustomerLedgerCredit(db, {
            ...allocationInput,
            clientCommandId: `competing-${suffix}`,
            expectedRevision: "5",
            amountMinor: "2500",
          }),
        ),
      )
      expect(
        competing.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        competing.filter((result) => result.status === "rejected"),
      ).toHaveLength(1)
      const statementInput = { ...actor, accountId: account.id, limit: 1 }
      const historical = await getCustomerLedgerStatement(db, {
        ...statementInput,
        snapshotSequence: "4",
      })
      expect(historical.totals).toEqual({
        debitMinor: "10000",
        creditMinor: "8000",
        allocatedMinor: "4000",
        outstandingDebtMinor: "6000",
        availableCreditMinor: "4000",
        netBalanceMinor: "2000",
      })
      expect(historical.entries[0]?.runningBalanceMinor).toBe("10000")
      expect(historical.nextCursor).toBe("1")
      const nextPage = await getCustomerLedgerStatement(db, {
        ...statementInput,
        snapshotSequence: "4",
        afterSequence: historical.nextCursor ?? "0",
      })
      expect(nextPage.entries[0]?.runningBalanceMinor).toBe("7000")
      expect(nextPage.totals).toEqual(historical.totals)
      const current = await getCustomerLedgerStatement(db, statementInput)
      expect(current.snapshotSequence).toBe("6")
      expect(current.totals.outstandingDebtMinor).toBe("5000")
      expect(current.totals.availableCreditMinor).toBe("3000")
      expect(current.totals.netBalanceMinor).toBe("2000")
      const detail = await getCustomerLedgerAccountDetail(db, {
        ...actor,
        accountId: account.id,
      })
      expect(detail.customer.id).toBe(customer.id)
      expect(detail.customer.name).toBe("Opening customer")
      expect(detail.book?.id).toBe(bookId)
      expect(detail.revision).toBe("6")
      expect(detail.snapshotSequence).toBe(current.snapshotSequence)
      expect(detail.totals).toEqual(current.totals)
      expect(detail.completeness).toBe("INCOMPLETE_SOURCE_COVERAGE")
      const firstAccounts = await listCustomerLedgerAccounts(db, {
        ...actor,
        customerId: customer.id,
        limit: 1,
      })
      expect(firstAccounts.accounts.map((row) => row.currencyCode)).toEqual([
        "NGN",
      ])
      expect(firstAccounts.nextCursor).toBe("NGN")
      const nextAccounts = await listCustomerLedgerAccounts(db, {
        ...actor,
        customerId: customer.id,
        limit: 1,
        afterCurrency: firstAccounts.nextCursor ?? undefined,
      })
      expect(nextAccounts.accounts.map((row) => row.currencyCode)).toEqual([
        "USD",
      ])
      expect(nextAccounts.nextCursor).toBe(null)
      const foreignDetail = await getCustomerLedgerAccountDetail(db, {
        ...actor,
        accountId: foreignCurrency.id,
      })
      expect(foreignDetail.book).toBe(null)
      expect(foreignDetail.totals.netBalanceMinor).toBe("0")
      expect(
        (
          await listCustomerLedgerAccounts(db, {
            ...actor,
            customerId: customer.id,
            currencyCode: "USD",
          })
        ).accounts,
      ).toHaveLength(1)
      await expect(
        listCustomerLedgerAccounts(db, { ...actor, customerId: "missing" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        getCustomerLedgerAccountDetail(db, { ...actor, accountId: "missing" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        listCustomerLedgerAccounts(db, {
          ...actor,
          customerId: customer.id,
          limit: 51,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        listCustomerLedgerAccounts(db, {
          ...actor,
          customerId: customer.id,
          afterCurrency: "usd",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        getCustomerLedgerAccountDetail(db, {
          ...actor,
          tenantId: "other-tenant",
          accountId: account.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        getCustomerLedgerStatement(db, {
          ...statementInput,
          snapshotSequence: "7",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
    } finally {
      // Only run-owned synthetic acceptance data is removed; no merchant IDs
      // are accepted from environment variables or external input.
      if (bookId)
        await db.$transaction(
          async (tx) => {
            const accounts = await tx.customerLedgerAccount.findMany({
              where: { tenantId },
              select: { id: true },
            })
            for (const account of accounts) {
              await tx.customerLedgerAllocationRelease.deleteMany({
                where: { allocation: { accountId: account.id } },
              })
              await tx.customerLedgerAllocation.deleteMany({
                where: { accountId: account.id },
              })
              await tx.customerLedgerReceipt.deleteMany({
                where: { accountId: account.id },
              })
              await tx.customerLedgerCommand.deleteMany({
                where: { accountId: account.id },
              })
              await tx.customerLedgerEntry.deleteMany({
                where: { accountId: account.id },
              })
              await tx.customerLedgerAccount.delete({
                where: { id: account.id },
              })
            }
            await tx.financeBillPayment.deleteMany({ where: { bookId } })
            await tx.financeBillLine.deleteMany({ where: { bookId } })
            await tx.financeBill.deleteMany({ where: { bookId } })
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({
              where: { bookId, reversalOfId: { not: null } },
            })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.delete({ where: { id: bookId } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      if (tenantId) await db.tenant.delete({ where: { id: tenantId } })
      await db.user.delete({ where: { id: user.id } })
    }
  }, 180_000)
})
