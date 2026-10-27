import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { recordFinanceMoneyMovement } from "./money"
import { getFinanceAccountBalances } from "./reads"
import {
  getFinanceSupplierOpeningBalance,
  payFinanceSupplierOpening,
} from "./supplier-opening-payment"
import {
  createFinanceSupplier,
  recordFinanceSupplierOpening,
  reverseFinanceSupplierEntry,
} from "./supplier-writes"

// Throws from a helper so a mismatched fixture never gets deleted.
function refuseCleanup(mismatch: boolean) {
  if (mismatch) throw new Error("Refusing non-fixture cleanup")
}

// F1.6.05 posting matrix row 15 (SUPPLIER_OPENING_PAYMENT) and its row 17 reversal.
describeWithServiceCommerceDatabase("supplier opening payment", () => {
  test("pays down a starting balance once, replays, refuses overpayment and closed periods", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const slug = `supplier-opening-pay-${suffix}`
    const user = await db.user.create({
      data: {
        email: `${slug}@example.invalid`,
        name: "Supplier opening payment acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug,
          name: "Supplier opening payment acceptance",
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
      const startsAt = new Date("2026-01-01T00:00:00Z")
      const book = await createFinanceBook(db, { ...actor, startsAt })
      bookId = book.id
      const scope = { ...actor, bookId }
      const accounts = await db.financeAccount.findMany({ where: { bookId } })
      const account = (purpose: string) => {
        const found = accounts.find((row) => row.purpose === purpose)
        if (!found) throw new Error(`Missing fixture account ${purpose}`)
        return found
      }
      const bank = account("BANK")
      const payable = account("PAYABLE")
      await recordFinanceMoneyMovement(db, {
        ...scope,
        clientCommandId: "bank-opening",
        kind: "OPENING_BALANCE",
        accountId: bank.id,
        amountMinor: "50000",
        description: "Bank at cutoff",
        effectiveAt: startsAt,
      })
      const supplier = await createFinanceSupplier(db, {
        ...scope,
        clientCommandId: "supplier",
        code: "OPENPAY",
        name: "Opening payment supplier",
      })
      const noOpening = await createFinanceSupplier(db, {
        ...scope,
        clientCommandId: "supplier-no-opening",
        code: "NOOPEN",
        name: "Supplier without opening",
      })
      const opening = await recordFinanceSupplierOpening(db, {
        ...scope,
        supplierId: supplier.id,
        clientCommandId: "opening-payable",
        kind: "PAYABLE",
        amountMinor: "10000",
        description: "Owed at cutoff",
        effectiveAt: startsAt,
      })
      const outstanding = async () =>
        (
          await getFinanceSupplierOpeningBalance(db, {
            ...scope,
            supplierId: supplier.id,
          })
        )?.outstandingMinor
      const balance = async (id: string) =>
        (await getFinanceAccountBalances(db, scope)).accounts.find(
          (row) => row.id === id,
        )?.balanceMinor
      const counts = async () => ({
        entries: await db.financeSupplierEntry.count({ where: { bookId } }),
        journals: await db.financeJournalEntry.count({ where: { bookId } }),
      })
      expect(await outstanding()).toBe("10000")

      const payment = {
        ...scope,
        clientCommandId: "pay-opening-1",
        supplierId: supplier.id,
        moneyAccountId: bank.id,
        amountMinor: "4000",
        description: "Part of the old balance",
        effectiveAt: new Date("2026-03-01T10:00:00Z"),
      }
      const paid = await payFinanceSupplierOpening(db, payment)
      expect(await payFinanceSupplierOpening(db, payment)).toEqual(paid)
      await expect(
        payFinanceSupplierOpening(db, { ...payment, amountMinor: "4001" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const entry = await db.financeSupplierEntry.findUniqueOrThrow({
        where: { id: paid.id },
        include: { journalEntry: { include: { lines: true } } },
      })
      expect(entry).toMatchObject({
        bookId,
        supplierId: supplier.id,
        kind: "OPENING_PAYMENT",
        side: "DEBIT",
        amountMinor: 4000n,
        moneyAccountId: bank.id,
        effectiveAt: payment.effectiveAt,
        actorUserId: user.id,
        reversalOfId: null,
      })
      expect(entry.journalEntry).toMatchObject({
        sourceKind: "SUPPLIER_OPENING_PAYMENT",
        sourceId: entry.id,
        effectiveAt: payment.effectiveAt,
      })
      expect(
        entry.journalEntry.lines
          .map((line) => [
            line.accountId,
            line.debitMinor.toString(),
            line.creditMinor.toString(),
          ])
          .sort(),
      ).toEqual(
        [
          [payable.id, "4000", "0"],
          [bank.id, "0", "4000"],
        ].sort(),
      )
      expect(await outstanding()).toBe("6000")
      expect(await balance(payable.id)).toBe("6000")
      expect(await balance(bank.id)).toBe("46000")

      // Refusals write nothing.
      const before = await counts()
      for (const [change, code] of [
        [{ amountMinor: "6001" }, "INVALID_JOURNAL"],
        [{ effectiveAt: new Date("2025-12-31T00:00:00Z") }, "INVALID_JOURNAL"],
        [{ moneyAccountId: account("OPERATING_EXPENSE").id }, "NOT_FOUND"],
        [{ supplierId: noOpening.id }, "CONFLICT"],
        [{ supplierId: "missing-supplier" }, "NOT_FOUND"],
      ] as const) {
        await expect(
          payFinanceSupplierOpening(db, {
            ...payment,
            ...change,
            clientCommandId: `refused-${randomUUID()}`,
          }),
        ).rejects.toMatchObject({ code })
      }
      await expect(
        payFinanceSupplierOpening(db, { ...payment, tenantId: "other-tenant" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(await counts()).toEqual(before)

      // Closed period: refused, nothing written; the saved command still replays.
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: new Date("2026-03-31T00:00:00Z") },
      })
      await expect(
        payFinanceSupplierOpening(db, {
          ...payment,
          clientCommandId: "pay-opening-closed",
          amountMinor: "1000",
          effectiveAt: new Date("2026-03-15T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await counts()).toEqual(before)
      expect(await outstanding()).toBe("6000")
      expect(await payFinanceSupplierOpening(db, payment)).toEqual(paid)
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: null },
      })

      // The opening cannot be undone while a payment toward it stands.
      await expect(
        reverseFinanceSupplierEntry(db, {
          ...scope,
          clientCommandId: "undo-opening-early",
          entryId: opening.id,
          reason: "Wrong opening",
          effectiveAt: new Date("2026-04-01T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })

      // Two competing payments for the whole remainder: exactly one lands.
      const race = await Promise.allSettled(
        ["a", "b"].map((label) =>
          payFinanceSupplierOpening(db, {
            ...payment,
            clientCommandId: `pay-rest-${label}`,
            amountMinor: "6000",
            effectiveAt: new Date("2026-04-02T00:00:00Z"),
          }),
        ),
      )
      expect(race.filter((row) => row.status === "fulfilled")).toHaveLength(1)
      const rejected = race.find((row) => row.status === "rejected")
      expect(
        rejected?.status === "rejected" ? rejected.reason : null,
      ).toMatchObject({ code: "CONFLICT" })
      expect(await outstanding()).toBe("0")
      expect(await balance(payable.id)).toBe("0")
      await expect(
        payFinanceSupplierOpening(db, {
          ...payment,
          clientCommandId: "pay-after-settled",
          amountMinor: "1",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })

      // Row 17: undoing the first payment restores what is owed.
      const undo = {
        ...scope,
        clientCommandId: "undo-payment",
        entryId: paid.id,
        reason: "Paid from the wrong account",
        effectiveAt: new Date("2026-04-03T00:00:00Z"),
      }
      const undone = await reverseFinanceSupplierEntry(db, undo)
      expect(await reverseFinanceSupplierEntry(db, undo)).toEqual(undone)
      expect(await outstanding()).toBe("4000")
      expect(await balance(payable.id)).toBe("4000")
      expect(await balance(bank.id)).toBe("44000")

      const totals = await db.financeJournalLine.groupBy({
        by: ["entryId"],
        where: { bookId },
        _sum: { debitMinor: true, creditMinor: true },
      })
      for (const row of totals)
        expect(row._sum.debitMinor).toBe(row._sum.creditMinor)
    } finally {
      if (bookId) {
        const owned = await db.financeBook.findUniqueOrThrow({
          where: { id: bookId },
          select: { tenantId: true },
        })
        refuseCleanup(owned.tenantId !== tenantId)
        await db.$transaction(
          async (tx) => {
            const scope = { bookId: bookId as string }
            await tx.financeSupplierEntry.deleteMany({
              where: { ...scope, reversalOfId: { not: null } },
            })
            await tx.financeSupplierEntry.deleteMany({ where: scope })
            await tx.financeSupplierAccount.deleteMany({ where: scope })
            await tx.financeCommand.deleteMany({ where: scope })
            await tx.financeJournalLine.deleteMany({ where: scope })
            await tx.financeJournalEntry.deleteMany({
              where: { ...scope, reversalOfId: { not: null } },
            })
            await tx.financeJournalEntry.deleteMany({ where: scope })
            await tx.financeAccount.deleteMany({ where: scope })
            await tx.financeBook.delete({ where: { id: scope.bookId } })
          },
          { maxWait: 10_000, timeout: 60_000 },
        )
      }
      if (tenantId) {
        const tenant = await db.tenant.findUniqueOrThrow({
          where: { id: tenantId },
        })
        refuseCleanup(
          tenant.slug !== slug || tenant.dataClassification !== "QA",
        )
        await db.tenant.delete({ where: { id: tenantId } })
      }
      await db.user.delete({ where: { id: user.id } })
      expect(await db.tenant.count({ where: { slug } })).toBe(0)
    }
  }, 240_000)
})
