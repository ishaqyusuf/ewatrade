import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { getFinanceAccountBalances } from "../finance/reads"
import { createCustomerWithOpening } from "./customer-opening"
import { recordCustomerLedgerReceipt } from "./receipts"
import { getCustomerStatementDocument } from "./statement-document"

describeWithServiceCommerceDatabase("customer statement document", () => {
  test("prints opening, dated lines, closing and bank details for chosen dates", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const owner = await db.user.create({
      data: {
        name: "Statement PDF QA",
        email: `statement-pdf-${runId}@example.invalid`,
      },
    })
    const manager = await db.user.create({
      data: {
        name: "Statement PDF manager",
        email: `statement-pdf-manager-${runId}@example.invalid`,
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          name: "Statement PDF QA",
          slug: `statement-pdf-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          timezone: "Africa/Lagos",
          users: {
            create: [
              { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
            ],
          },
        },
      })
      tenantId = tenant.id
      const actor = { tenantId, actorUserId: owner.id }
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01"),
      })
      bookId = book.id
      const store = await db.store.create({
        data: {
          tenantId,
          name: "Lekki",
          slug: "statement-lekki",
          status: "ACTIVE",
          countryCode: "NG",
          addressLine1: "12 Admiralty Way",
          city: "Lagos",
          supportPhone: "0803 111 2222",
        },
      })
      const created = await createCustomerWithOpening(db, {
        ...actor,
        bookId,
        clientCommandId: `statement-${runId}`,
        customer: { name: "Amina Bello", phone: "0803 000 0001" },
        opening: {
          direction: "DEBT",
          amountMinor: "500000",
          reason: "Owed from the old notebook",
        },
      })
      const balances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      const cash = balances.accounts.find((row) => row.purpose === "CASH")
      const bank = balances.accounts.find((row) => row.purpose === "BANK")
      if (!cash || !bank) throw new Error("Missing money accounts")
      await db.financeAccount.update({
        where: { id: bank.id },
        data: {
          bankName: "GTBank",
          bankAccountNumber: "0123456789",
          bankAccountHolder: "Statement PDF QA Ltd",
        },
      })
      await recordCustomerLedgerReceipt(db, {
        ...actor,
        bookId,
        accountId: created.accountId,
        moneyAccountId: cash.id,
        clientCommandId: `statement-pay-${runId}`,
        amountMinor: "200000",
        method: "CASH",
        description: "Private merchant note",
        storeId: store.id,
      })
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
      }).format(new Date())
      const read = (
        input: Partial<Parameters<typeof getCustomerStatementDocument>[1]>,
      ) =>
        getCustomerStatementDocument(db, {
          ...actor,
          accountId: created.accountId,
          from: "2026-01-01",
          through: today,
          storeId: store.id,
          ...input,
        })

      const year = await read({})
      expect(year).toMatchObject({
        currencyCode: "NGN",
        timezone: "Africa/Lagos",
        openingMinor: "0",
        chargedMinor: "500000",
        paidMinor: "200000",
        closingMinor: "300000",
        business: {
          name: "Statement PDF QA",
          storeName: "Lekki",
          address: "12 Admiralty Way, Lagos",
          phone: "0803 111 2222",
        },
        customer: { name: "Amina Bello", phone: "0803 000 0001" },
        paymentAccounts: [
          {
            bankName: "GTBank",
            accountNumber: "0123456789",
            accountHolder: "Statement PDF QA Ltd",
          },
        ],
      })
      expect(
        year.lines.map((line) => [line.title, line.detail, line.runningMinor]),
      ).toEqual([
        ["Starting balance", "Owed before this account", "500000"],
        ["Payment", "Cash", "300000"],
      ])
      expect(JSON.stringify(year)).not.toContain("Private merchant note")

      // Starting after the opening: it becomes the opening balance.
      const later = await read({ from: "2026-01-02" })
      expect(later).toMatchObject({
        openingMinor: "500000",
        chargedMinor: "0",
        closingMinor: "300000",
      })
      expect(later.lines).toHaveLength(1)

      // Before anything was recorded.
      expect(
        await read({ from: "2025-12-01", through: "2025-12-31" }),
      ).toMatchObject({ openingMinor: "0", closingMinor: "0", lines: [] })

      // A pinned snapshot leaves later entries out.
      expect(await read({ snapshotSequence: "1" })).toMatchObject({
        snapshotSequence: "1",
        closingMinor: "500000",
      })
      expect(
        (await read({ includePaymentAccounts: false })).paymentAccounts,
      ).toEqual([])

      await expect(
        read({ from: "2026-02-01", through: "2026-01-01" }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(read({ snapshotSequence: "99" })).rejects.toMatchObject({
        code: "INVALID_JOURNAL",
      })
      await expect(read({ actorUserId: manager.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await expect(read({ tenantId: "another-tenant" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
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
            await tx.customer.deleteMany({ where: { tenantId } })
            if (bookId) {
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeJournalLine.deleteMany({ where: { bookId } })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.delete({ where: { id: bookId } })
            }
            await tx.store.deleteMany({ where: { tenantId } })
            await tx.tenant.delete({ where: { id: tenantId } })
          },
          { maxWait: 10000, timeout: 30000 },
        )
      await db.user.deleteMany({
        where: { id: { in: [owner.id, manager.id] } },
      })
    }
  }, 240000)
})
