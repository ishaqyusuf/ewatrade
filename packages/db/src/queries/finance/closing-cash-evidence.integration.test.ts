import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { recordFinanceCashCount } from "./cash-counts"
import { configureFinanceFiscalCalendar } from "./fiscal-settings"
import { recordFinanceMoneyMovement } from "./money"
import { getFinancePeriodCloseChecklist } from "./period-close-checklist"
import { getFinanceYearEndPreview } from "./year-end-preview"

describeWithServiceCommerceDatabase("closing cash evidence", () => {
  test("both protected previews verify original command and actual cutoff ledger without granting full-close authority", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const email = `closing-cash-${runId}@example.invalid`
    const slug = `closing-cash-${runId}`
    const through = new Date("2025-12-31T23:59:59.999Z")
    try {
      const user = await db.user.create({
        data: { email, name: "Closing cash QA" },
      })
      const tenant = await db.tenant.create({
        data: {
          slug,
          name: "Closing cash QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      const actor = { tenantId: tenant.id, actorUserId: user.id }
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2025-01-01T00:00:00Z"),
      })
      const scope = { ...actor, bookId: book.id }
      const cash = await db.financeAccount.findFirstOrThrow({
        where: { bookId: book.id, purpose: "CASH" },
      })
      await configureFinanceFiscalCalendar(db, {
        ...scope,
        clientCommandId: `calendar-${runId}`,
        startMonth: 1,
        startDay: 1,
        expectedRevision: 0,
        reason: "Isolated closing evidence fixture",
      })
      await recordFinanceMoneyMovement(db, {
        ...scope,
        clientCommandId: `original-${runId}`,
        kind: "OWNER_CONTRIBUTION",
        accountId: cash.id,
        amountMinor: "100",
        description: "Owned QA opening cash",
        effectiveAt: new Date("2025-01-02T00:00:00Z"),
      })
      const count = await recordFinanceCashCount(db, {
        ...scope,
        clientCommandId: `count-${runId}`,
        accountId: cash.id,
        asOf: through,
        observedBalanceMinor: "100",
        reference: "Owned QA physical observation",
      })
      const original = await db.financeReconciliation.findUniqueOrThrow({
        where: { id: count.id },
      })
      expect(original.snapshotSequence).toBe(1n)
      expect(original.expectedBalanceMinor).toBe(100n)
      // This later effective date must be excluded from both current cutoff and
      // the count's original basis, despite advancing the current Book watermark.
      await recordFinanceMoneyMovement(db, {
        ...scope,
        clientCommandId: `later-${runId}`,
        kind: "OWNER_CONTRIBUTION",
        accountId: cash.id,
        amountMinor: "5",
        description: "Owned QA later-year cash",
        effectiveAt: new Date("2026-01-02T00:00:00Z"),
      })
      const [year, period] = await Promise.all([
        getFinanceYearEndPreview(db, scope),
        getFinancePeriodCloseChecklist(db, { ...scope, through }),
      ])
      expect(year.cashEvidence).toMatchObject({
        through,
        snapshotSequence: "2",
        status: "PASS",
        countCoverageComplete: true,
        commandCoverageComplete: true,
      })
      expect(year.cashEvidence.cash[0]).toMatchObject({
        countId: count.id,
        countSnapshotSequence: "1",
        originalExpectedBalanceMinor: "100",
        closingBalanceMinor: "100",
        basisVerified: true,
      })
      expect(period.cash).toEqual(year.cashEvidence.cash)
      expect(
        period.checks.find((check) => check.id === "CASH_RECONCILIATION")
          ?.status,
      ).toBe("PASS")
      expect(
        period.checks.find((check) => check.id === "BANK_RECONCILIATION")
          ?.status,
      ).toBe("REVIEW_REQUIRED")
      expect(year.canClose).toBe(false)
      expect(period.operationallyReconciled).toBe(false)

      await db.financeReconciliation.update({
        where: { id: count.id },
        data: { expectedBalanceMinor: 101n },
      })
      await expect(getFinanceYearEndPreview(db, scope)).rejects.toThrow(
        "original ledger basis changed",
      )
      await db.financeReconciliation.update({
        where: { id: count.id },
        data: { expectedBalanceMinor: original.expectedBalanceMinor },
      })
      const command = await db.financeCommand.findUniqueOrThrow({
        where: {
          bookId_clientCommandId: {
            bookId: book.id,
            clientCommandId: `count-${runId}`,
          },
        },
      })
      await db.financeCommand.update({
        where: { id: command.id },
        data: { payloadHash: "owned-qa-altered-hash" },
      })
      await expect(
        getFinancePeriodCloseChecklist(db, { ...scope, through }),
      ).rejects.toThrow("original command changed")
      await db.financeCommand.update({
        where: { id: command.id },
        data: { payloadHash: command.payloadHash },
      })
      // Original basis still verifies at sequence1; the new backdated source now
      // makes the stored physical observation differ from the current cutoff.
      await recordFinanceMoneyMovement(db, {
        ...scope,
        clientCommandId: `backdated-${runId}`,
        kind: "OWNER_CONTRIBUTION",
        accountId: cash.id,
        amountMinor: "1",
        description: "Owned QA changed cutoff cash",
        effectiveAt: new Date("2025-02-01T00:00:00Z"),
      })
      const changed = await getFinanceYearEndPreview(db, scope)
      expect(changed.cashEvidence.status).toBe("BLOCKED")
      expect(changed.cashEvidence.cash[0]).toMatchObject({
        basisVerified: true,
        originalExpectedBalanceMinor: "100",
        observedBalanceMinor: "100",
        closingBalanceMinor: "101",
      })
      expect(changed.canClose).toBe(false)
    } finally {
      // Exact unique identities recover a lost create response without ever
      // selecting another merchant's rows or an unrelated QA fixture.
      const users = await db.user.findMany({
        where: { email },
        select: { id: true },
      })
      const tenants = await db.tenant.findMany({
        where: { slug },
        select: { id: true },
      })
      const tenantIds = tenants.map((row) => row.id)
      const userIds = users.map((row) => row.id)
      const books = await db.financeBook.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { id: true },
      })
      const bookIds = books.map((row) => row.id)
      for (const bookId of bookIds) {
        await db.$transaction(
          async (tx) => {
            await tx.financeFiscalCalendar.deleteMany({ where: { bookId } })
            await tx.financeReconciliation.deleteMany({ where: { bookId } })
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.deleteMany({ where: { id: bookId } })
          },
          { maxWait: 10000, timeout: 30000 },
        )
      }
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
      await db.user.deleteMany({ where: { id: { in: userIds } } })
      const absences = await Promise.all([
        db.financeFiscalCalendar.count({ where: { bookId: { in: bookIds } } }),
        db.financeReconciliation.count({ where: { bookId: { in: bookIds } } }),
        db.financeCommand.count({ where: { bookId: { in: bookIds } } }),
        db.financeJournalLine.count({ where: { bookId: { in: bookIds } } }),
        db.financeJournalEntry.count({ where: { bookId: { in: bookIds } } }),
        db.financeAccount.count({ where: { bookId: { in: bookIds } } }),
        db.financeBook.count({ where: { id: { in: bookIds } } }),
        db.financeBook.count({ where: { tenantId: { in: tenantIds } } }),
        db.membership.count({
          where: {
            OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }],
          },
        }),
        db.tenant.count({ where: { slug } }),
        db.user.count({ where: { email } }),
      ])
      for (const absence of absences) expect(absence).toBe(0)
    }
  }, 180000)
})
