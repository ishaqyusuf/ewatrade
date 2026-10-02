import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { postFinanceJournalInTransaction } from "./posting"
import { getFinanceAccountBalances } from "./reads"
import {
  getFinanceSupplierStatement,
  listFinanceSuppliers,
} from "./supplier-reads"
import {
  createFinanceSupplier,
  recordFinanceSupplierAdvance,
  recordFinanceSupplierOpening,
  reverseFinanceSupplierEntry,
} from "./supplier-writes"

function assertFixtureCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

describeWithServiceCommerceDatabase("supplier financial foundation", () => {
  test("sources reconcile separately, corrections retain history and scope guards are atomic", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const email = `supplier-finance-${suffix}@example.invalid`
    const user = await db.user.create({
      data: { email, name: "Supplier acceptance" },
    })
    const fixtures: Array<{ tenantId: string; slug: string; bookId?: string }> =
      []
    try {
      async function fixture(label: string) {
        const slug = `supplier-finance-${suffix}-${label}`
        const tenant = await db.tenant.create({
          data: {
            slug,
            name: "Supplier acceptance",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        const owned = {
          tenantId: tenant.id,
          slug,
          bookId: undefined as string | undefined,
        }
        fixtures.push(owned)
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const createdBook = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        const book = await db.financeBook.findUniqueOrThrow({
          where: { id: createdBook.id },
        })
        owned.bookId = book.id
        const accounts = await db.financeAccount.findMany({
          where: { bookId: book.id },
        })
        const account = (purpose: string) => {
          const found = accounts.find((row) => row.purpose === purpose)
          if (!found) throw new Error(`Missing fixture account ${purpose}`)
          return found
        }
        return { actor, book, account }
      }
      const local = await fixture("local")
      const foreign = await fixture("foreign")
      const base = { ...local.actor, bookId: local.book.id }
      const create = {
        ...base,
        clientCommandId: "create-supplier",
        code: "seed",
        name: "Seed supplier",
      }
      const supplier = await createFinanceSupplier(db, create)
      expect(await createFinanceSupplier(db, create)).toEqual(supplier)
      await expect(
        createFinanceSupplier(db, { ...create, name: "Changed" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        createFinanceSupplier(db, {
          ...create,
          clientCommandId: "duplicate-code",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const second = await createFinanceSupplier(db, {
        ...create,
        clientCommandId: "second-supplier",
        code: "TOOLS",
        name: "Tools supplier",
      })
      const foreignSupplier = await createFinanceSupplier(db, {
        ...foreign.actor,
        bookId: foreign.book.id,
        clientCommandId: "foreign-supplier",
        code: "OTHER",
        name: "Foreign supplier",
      })
      const opening = {
        ...base,
        supplierId: supplier.id,
        clientCommandId: "opening-payable",
        kind: "PAYABLE" as const,
        amountMinor: "10001",
        description: "Verified cutoff payable",
        effectiveAt: local.book.startsAt,
      }
      const payable = await recordFinanceSupplierOpening(db, opening)
      expect(await recordFinanceSupplierOpening(db, opening)).toEqual(payable)
      await expect(
        recordFinanceSupplierOpening(db, {
          ...opening,
          clientCommandId: "duplicate-opening",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        recordFinanceSupplierOpening(db, { ...opening, amountMinor: "10002" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const advanceOpening = await recordFinanceSupplierOpening(db, {
        ...opening,
        clientCommandId: "opening-advance",
        kind: "ADVANCE",
        amountMinor: "2345",
        description: "Verified cutoff advance",
      })
      const paidInput = {
        ...base,
        supplierId: supplier.id,
        clientCommandId: "paid-advance",
        moneyAccountId: local.account("BANK").id,
        amountMinor: "7654",
        description: "Supplier advance payment",
        effectiveAt: new Date("2026-09-01T00:00:00Z"),
      }
      const [advance, duplicateAdvance] = await Promise.all([
        recordFinanceSupplierAdvance(db, paidInput),
        recordFinanceSupplierAdvance(db, paidInput),
      ])
      expect(duplicateAdvance).toEqual(advance)
      expect(await recordFinanceSupplierAdvance(db, paidInput)).toEqual(advance)
      const before = await getFinanceSupplierStatement(db, {
        ...base,
        supplierId: supplier.id,
        limit: 1,
      })
      expect(before.payableMinor).toBe("10001")
      expect(before.advanceMinor).toBe("9999")
      expect(before.data.map((row) => row.id)).toEqual([advance.id])
      expect(before.nextCursor).not.toBeNull()
      const pinned = before.snapshotSequence
      const original = await db.financeSupplierEntry.findUniqueOrThrow({
        where: { id: advance.id },
        include: { journalEntry: { include: { lines: true } } },
      })
      const entryCount = await db.financeSupplierEntry.count({
        where: { bookId: base.bookId },
      })
      const journalCount = await db.financeJournalEntry.count({
        where: { bookId: base.bookId },
      })
      const commandCount = await db.financeCommand.count({
        where: { bookId: base.bookId },
      })
      for (const invalid of [
        {
          ...paidInput,
          clientCommandId: "foreign-supplier-denial",
          supplierId: foreignSupplier.id,
        },
        {
          ...paidInput,
          clientCommandId: "foreign-account-denial",
          moneyAccountId: foreign.account("BANK").id,
        },
        {
          ...paidInput,
          clientCommandId: "control-account-denial",
          moneyAccountId: local.account("SUPPLIER_ADVANCE").id,
        },
        {
          ...paidInput,
          clientCommandId: "negative-amount-denial",
          amountMinor: "-1",
        },
      ])
        await expect(
          recordFinanceSupplierAdvance(db, invalid),
        ).rejects.toBeInstanceOf(Error)
      await expect(
        recordFinanceSupplierOpening(db, {
          ...opening,
          supplierId: second.id,
          clientCommandId: "wrong-cutoff",
          effectiveAt: new Date("2026-01-02"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      expect(
        await db.financeSupplierEntry.count({ where: { bookId: base.bookId } }),
      ).toBe(entryCount)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: base.bookId } }),
      ).toBe(journalCount)
      expect(
        await db.financeCommand.count({ where: { bookId: base.bookId } }),
      ).toBe(commandCount)
      for (const violation of ["supplier", "account", "reversal"] as const) {
        const rollback = new Error(`Rollback isolated ${violation} FK probe`)
        let rejectedCode: unknown
        await db
          .$transaction(
            async (tx) => {
              await postFinanceJournalInTransaction(tx, {
                ...base,
                clientCommandId: `fk-probe-${violation}`,
                sourceKind: "SUPPLIER_FK_ACCEPTANCE",
                sourceId: violation,
                description: "Rollback-only foreign-key probe",
                effectiveAt: new Date("2026-09-03"),
                lines: [
                  {
                    accountId: local.account("SUPPLIER_ADVANCE").id,
                    side: "DEBIT",
                    amountMinor: "1",
                  },
                  {
                    accountId: local.account("BANK").id,
                    side: "CREDIT",
                    amountMinor: "1",
                  },
                ],
              })
              const probeJournal =
                await tx.financeJournalEntry.findUniqueOrThrow({
                  where: {
                    bookId_sourceKind_sourceId: {
                      bookId: base.bookId,
                      sourceKind: "SUPPLIER_FK_ACCEPTANCE",
                      sourceId: violation,
                    },
                  },
                })
              try {
                await tx.financeSupplierEntry.create({
                  data: {
                    bookId: base.bookId,
                    supplierId:
                      violation === "supplier" ? foreignSupplier.id : second.id,
                    kind: violation === "reversal" ? "REVERSAL" : "ADVANCE",
                    side: "DEBIT",
                    amountMinor: BigInt(1),
                    journalEntryId: probeJournal.id,
                    moneyAccountId:
                      violation === "account"
                        ? foreign.account("BANK").id
                        : local.account("BANK").id,
                    effectiveAt: new Date("2026-09-03"),
                    actorUserId: user.id,
                    description: "Rollback-only probe",
                    reversalOfId:
                      violation === "reversal" ? advance.id : undefined,
                  },
                })
              } catch (failure) {
                rejectedCode =
                  failure && typeof failure === "object" && "code" in failure
                    ? failure.code
                    : undefined
              }
              throw rollback
            },
            { timeout: 30000 },
          )
          .catch((failure: unknown) => {
            if (failure !== rollback) throw failure
          })
        expect(rejectedCode).toBe("P2003")
      }
      const correction = {
        ...base,
        entryId: advance.id,
        clientCommandId: "reverse-paid-advance",
        reason: "Corrected duplicate reported movement",
        effectiveAt: new Date("2026-09-02T00:00:00Z"),
      }
      await expect(
        reverseFinanceSupplierEntry(db, {
          ...correction,
          effectiveAt: new Date("2026-08-31"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await db.financeJournalEntry.update({
        where: { id: original.journalEntryId },
        data: { actorUserId: "unmatched-source-actor" },
      })
      await expect(
        reverseFinanceSupplierEntry(db, correction),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await db.financeJournalEntry.update({
        where: { id: original.journalEntryId },
        data: { actorUserId: original.actorUserId },
      })
      const reversed = await reverseFinanceSupplierEntry(db, correction)
      expect(await reverseFinanceSupplierEntry(db, correction)).toEqual(
        reversed,
      )
      await expect(
        reverseFinanceSupplierEntry(db, { ...correction, reason: "Changed" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        reverseFinanceSupplierEntry(db, {
          ...correction,
          clientCommandId: "double-correction",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        reverseFinanceSupplierEntry(db, {
          ...correction,
          entryId: reversed.id,
          clientCommandId: "reverse-reversal",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const historical = await getFinanceSupplierStatement(db, {
        ...base,
        supplierId: supplier.id,
        snapshotSequence: pinned,
        limit: 1,
      })
      expect(historical.payableMinor).toBe("10001")
      expect(historical.advanceMinor).toBe("9999")
      expect(historical.data[0]?.reversal).toBeNull()
      const continuation = await getFinanceSupplierStatement(db, {
        ...base,
        supplierId: supplier.id,
        snapshotSequence: pinned,
        cursor: before.nextCursor ?? undefined,
        limit: 1,
      })
      expect(continuation.data[0]?.id).toBe(advanceOpening.id)
      expect(continuation.payableMinor).toBe(before.payableMinor)
      expect(continuation.advanceMinor).toBe(before.advanceMinor)
      const current = await getFinanceSupplierStatement(db, {
        ...base,
        supplierId: supplier.id,
      })
      expect(current.advanceMinor).toBe("2345")
      expect(current.payableMinor).toBe("10001")
      expect(
        current.data.find((row) => row.id === advance.id)?.reversal?.id,
      ).toBe(reversed.id)
      const reversal = await db.financeSupplierEntry.findUniqueOrThrow({
        where: { id: reversed.id },
        include: { journalEntry: { include: { lines: true } } },
      })
      expect(reversal.reversalOfId).toBe(advance.id)
      expect(reversal.journalEntry.reversalOfId).toBe(original.journalEntryId)
      expect(reversal.supplierId).toBe(supplier.id)
      expect(reversal.amountMinor).toBe(original.amountMinor)
      for (const line of original.journalEntry.lines) {
        const opposite = reversal.journalEntry.lines.find(
          (row) => row.accountId === line.accountId,
        )
        expect(opposite?.debitMinor).toBe(line.creditMinor)
        expect(opposite?.creditMinor).toBe(line.debitMinor)
      }
      expect(
        await db.financeSupplierEntry.findUniqueOrThrow({
          where: { id: advance.id },
        }),
      ).toMatchObject({
        kind: "ADVANCE",
        amountMinor: original.amountMinor,
        journalEntryId: original.journalEntryId,
      })
      const balances = await getFinanceAccountBalances(db, base)
      expect(
        balances.accounts.find((row) => row.purpose === "BANK")?.balanceMinor,
      ).toBe("0")
      expect(
        balances.accounts.find((row) => row.purpose === "SALES")?.balanceMinor,
      ).toBe("0")
      expect(
        balances.accounts.find((row) => row.purpose === "OPERATING_EXPENSE")
          ?.balanceMinor,
      ).toBe("0")
      await expect(
        getFinanceSupplierStatement(db, {
          ...base,
          supplierId: foreignSupplier.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        getFinanceSupplierStatement(db, {
          ...base,
          supplierId: supplier.id,
          cursor: "1",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        getFinanceSupplierStatement(db, {
          ...base,
          supplierId: supplier.id,
          snapshotSequence: "99999",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        getFinanceSupplierStatement(db, {
          ...base,
          supplierId: second.id,
          snapshotSequence: pinned,
          cursor: before.nextCursor ?? undefined,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const directory = await listFinanceSuppliers(db, { ...base, limit: 1 })
      expect(directory.data[0]?.code).toBe("SEED")
      expect(directory.nextCursor).toBe(supplier.id)
      expect(
        (
          await listFinanceSuppliers(db, {
            ...base,
            cursor: directory.nextCursor ?? undefined,
            limit: 1,
          })
        ).data[0]?.id,
      ).toBe(second.id)
      expect(
        (await listFinanceSuppliers(db, { ...base, query: "tools" })).data.map(
          (row) => row.id,
        ),
      ).toEqual([second.id])
      await expect(
        listFinanceSuppliers(db, { ...base, cursor: foreignSupplier.id }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await db.financeAccount.update({
        where: { id: local.account("BANK").id },
        data: { archivedAt: new Date() },
      })
      await expect(
        recordFinanceSupplierAdvance(db, {
          ...paidInput,
          clientCommandId: "archived-account-denial",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await db.financeAccount.update({
        where: { id: local.account("BANK").id },
        data: { archivedAt: null },
      })
      await db.financeBook.update({
        where: { id: base.bookId },
        data: { closedThrough: new Date("2026-09-01") },
      })
      await expect(
        recordFinanceSupplierAdvance(db, {
          ...paidInput,
          clientCommandId: "closed-period-denial",
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      await db.financeBook.update({
        where: { id: base.bookId },
        data: { closedThrough: null },
      })
      await db.membership.updateMany({
        where: { tenantId: base.tenantId, userId: user.id },
        data: { status: "SUSPENDED" },
      })
      await expect(
        recordFinanceSupplierAdvance(db, {
          ...paidInput,
          clientCommandId: "revoked-membership-denial",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        getFinanceSupplierStatement(db, { ...base, supplierId: supplier.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.membership.updateMany({
        where: { tenantId: base.tenantId, userId: user.id },
        data: { status: "ACTIVE" },
      })
      for (const [id, command] of [
        [payable.id, "reverse-opening-payable"],
        [advanceOpening.id, "reverse-opening-advance"],
      ] as const) {
        await reverseFinanceSupplierEntry(db, {
          ...correction,
          entryId: id,
          clientCommandId: command,
        })
      }
      const restored = await getFinanceSupplierStatement(db, {
        ...base,
        supplierId: supplier.id,
      })
      expect(restored.payableMinor).toBe("0")
      expect(restored.advanceMinor).toBe("0")
      expect(restored.data).toHaveLength(6)
      await expect(
        recordFinanceSupplierOpening(db, {
          ...opening,
          clientCommandId: "replace-reversed-opening",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
    } finally {
      for (const owned of fixtures.reverse()) {
        const tenant = await db.tenant.findUniqueOrThrow({
          where: { id: owned.tenantId },
        })
        assertFixtureCleanup(
          tenant.slug === owned.slug && tenant.dataClassification === "QA",
          "Refusing non-fixture cleanup",
        )
        await db.$transaction(
          async (tx) => {
            const books = await tx.financeBook.findMany({
              where: { tenantId: owned.tenantId },
            })
            if (books.some((book) => book.id !== owned.bookId))
              throw new Error("Unexpected book during fixture cleanup")
            if (owned.bookId) {
              const scope = { bookId: owned.bookId }
              await tx.financeSupplierEntry.deleteMany({
                where: { ...scope, reversalOfId: { not: null } },
              })
              await tx.financeSupplierEntry.deleteMany({ where: scope })
              await tx.financeSupplierAccount.deleteMany({ where: scope })
              await tx.financeJournalLine.deleteMany({ where: scope })
              await tx.financeJournalEntry.deleteMany({
                where: { ...scope, reversalOfId: { not: null } },
              })
              await tx.financeJournalEntry.deleteMany({ where: scope })
              await tx.financeCommand.deleteMany({ where: scope })
              await tx.financeAccount.deleteMany({ where: scope })
              await tx.financeBook.delete({ where: { id: owned.bookId } })
            }
            await tx.membership.deleteMany({
              where: { tenantId: owned.tenantId, userId: user.id },
            })
            await tx.tenant.delete({ where: { id: owned.tenantId } })
          },
          { timeout: 60000 },
        )
      }
      const cleanupUser = await db.user.findUniqueOrThrow({
        where: { id: user.id },
      })
      assertFixtureCleanup(
        cleanupUser.email === email,
        "Refusing unexpected user cleanup",
      )
      await db.user.delete({ where: { id: user.id } })
      expect(
        await db.tenant.count({
          where: { slug: { startsWith: `supplier-finance-${suffix}-` } },
        }),
      ).toBe(0)
    }
  }, 180000)
})
