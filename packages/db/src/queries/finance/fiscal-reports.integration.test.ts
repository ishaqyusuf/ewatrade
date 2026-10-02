import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { listFinanceAccountLedger } from "./account-activity"
import { createFinanceBook } from "./accounts"
import {
  FINANCE_FISCAL_CLOSE_SOURCE,
  FINANCE_FISCAL_REVERSE_SOURCE,
} from "./fiscal-limits"
import { configureFinanceFiscalCalendar } from "./fiscal-settings"
import { recordFinanceMoneyMovement } from "./money"
import { getFinanceReports } from "./reports"
import { getFinanceYearEndPreview } from "./year-end-preview"

type EntryLine = {
  accountId: string
  debitMinor: bigint
  creditMinor: bigint
}
type BalanceSnapshot = {
  accountId: string
  closingDebitMinor: string
  closingCreditMinor: string
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing QA finance row: ${label}`)
  return value
}

function periodPnl(
  value: Awaited<ReturnType<typeof getFinanceReports>>["profitAndLoss"],
) {
  const { accounts, ...totals } = value
  return {
    ...totals,
    accounts: accounts.map((row) => ({
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      kind: row.kind,
      purpose: row.purpose,
      periodDebitMinor: row.periodDebitMinor,
      periodCreditMinor: row.periodCreditMinor,
      periodBalanceMinor: row.periodBalanceMinor,
    })),
  }
}

describeWithServiceCommerceDatabase(
  "finance fiscal report preservation",
  () => {
    test("preserves historical P&L across close, reversal and reclose", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const userEmail = `fiscal-report-${runId}@example.invalid`
      const tenantSlug = `fiscal-report-${runId}`
      const userIds: string[] = []
      const tenantIds: string[] = []
      const bookIds: string[] = []
      let ownedBookId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: userEmail,
            name: "Fiscal report QA",
          },
        })
        userIds.push(user.id)
        const tenant = await db.tenant.create({
          data: {
            slug: tenantSlug,
            name: "Fiscal report QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2024-01-01T00:00:00.000Z"),
        })
        ownedBookId = book.id
        bookIds.push(book.id)
        const bookId = book.id
        const accounts = await db.financeAccount.findMany({ where: { bookId } })
        const cash = required(
          accounts.find((row) => row.purpose === "CASH"),
          "cash",
        )
        const capital = required(
          accounts.find((row) => row.purpose === "CAPITAL"),
          "capital",
        )
        const sales = required(
          accounts.find((row) => row.purpose === "SALES"),
          "sales",
        )
        const cost = required(
          accounts.find((row) => row.purpose === "COST_OF_SALES"),
          "cost of sales",
        )
        const retained = required(
          accounts.find((row) => row.purpose === "RETAINED_EARNINGS"),
          "retained earnings",
        )

        const setup = await configureFinanceFiscalCalendar(db, {
          ...actor,
          bookId,
          clientCommandId: `report-calendar-${runId}`,
          startMonth: 10,
          startDay: 1,
          expectedRevision: 0,
          reason: "Configure a deterministic fiscal report fixture",
        })
        const calendar = await db.financeFiscalCalendar.findUniqueOrThrow({
          where: { bookId },
        })
        expect(calendar.id).toBe(setup.id)
        const emptyPreview = await getFinanceYearEndPreview(db, {
          ...actor,
          bookId,
        })
        expect(emptyPreview.earningsMinor).toBe("0")
        expect(emptyPreview.journals).toEqual([])
        expect(emptyPreview.canClose).toBe(false)

        const year1 = await db.financeFiscalYear.create({
          data: {
            bookId,
            calendarId: calendar.id,
            calendarRevision: calendar.revision,
            startMonth: calendar.startMonth,
            startDay: calendar.startDay,
            startsAt: new Date("2024-01-01T00:00:00.000Z"),
            endsAt: new Date("2024-09-30T23:59:59.999Z"),
            firstPeriodStub: true,
          },
        })

        await recordFinanceMoneyMovement(db, {
          ...actor,
          bookId,
          clientCommandId: `report-capital-${runId}`,
          accountId: cash.id,
          kind: "OWNER_CONTRIBUTION",
          amountMinor: "10000",
          description: "QA opening capital",
          effectiveAt: new Date("2024-01-01T00:00:00.000Z"),
        })

        async function postJournal(
          sourceId: string,
          effectiveAt: Date,
          lines: EntryLine[],
          sourceKind = "QA_FISCAL_REPORT_SOURCE",
          reversalOfId?: string,
        ) {
          return db.$transaction(
            async (tx) => {
              const current = await tx.financeBook.findUniqueOrThrow({
                where: { id: bookId },
              })
              const sequence = current.lastSequence + BigInt(1)
              const entry = await tx.financeJournalEntry.create({
                data: {
                  bookId,
                  sequence,
                  sourceKind,
                  sourceId: `${sourceId}-${randomUUID()}`,
                  payloadHash: randomUUID(),
                  description: "Synthetic QA fiscal report source",
                  actorUserId: actor.actorUserId,
                  effectiveAt,
                  ...(reversalOfId ? { reversalOfId } : {}),
                },
              })
              await tx.financeJournalLine.createMany({
                data: lines.map((line) => ({
                  bookId,
                  entryId: entry.id,
                  accountId: line.accountId,
                  debitMinor: line.debitMinor,
                  creditMinor: line.creditMinor,
                })),
              })
              await tx.financeBook.update({
                where: { id: bookId },
                data: { lastSequence: sequence },
              })
              return entry
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }

        const firstIncome = await postJournal(
          "income-1",
          new Date("2024-05-01T12:00:00.000Z"),
          [
            { accountId: cash.id, debitMinor: 10000n, creditMinor: 0n },
            { accountId: sales.id, debitMinor: 0n, creditMinor: 10000n },
          ],
        )
        await postJournal("expense-1", new Date("2024-06-01T12:00:00.000Z"), [
          { accountId: cost.id, debitMinor: 6000n, creditMinor: 0n },
          { accountId: cash.id, debitMinor: 0n, creditMinor: 6000n },
        ])
        await postJournal(
          "revenue-correction",
          new Date("2024-07-01T12:00:00.000Z"),
          [
            { accountId: sales.id, debitMinor: 1000n, creditMinor: 0n },
            { accountId: cash.id, debitMinor: 0n, creditMinor: 1000n },
          ],
        )

        const year1Range = {
          ...actor,
          bookId,
          from: year1.startsAt,
          through: year1.endsAt,
        }
        const preCloseBook = await db.financeBook.findUniqueOrThrow({
          where: { id: bookId },
        })
        const beforeClose = await getFinanceReports(db, {
          ...year1Range,
          snapshotSequence: preCloseBook.lastSequence.toString(),
        })
        expect(beforeClose.profitAndLoss).toMatchObject({
          revenueMinor: "9000",
          costOfSalesMinor: "6000",
          netProfitMinor: "3000",
        })
        expect(beforeClose.completeness).toBe("INCOMPLETE_SOURCE_COVERAGE")
        expect(beforeClose.coverageGaps).toContain(
          "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
        )
        expect(beforeClose.balanceSheet).toMatchObject({
          postedEquityMinor: "10000",
          unclosedEarningsMinor: "3000",
          totalEquityMinor: "13000",
          balanced: true,
        })

        async function persistEvent(input: {
          kind: "CLOSE" | "REVERSE"
          fiscalYearId: string
          effectiveAt: Date
          earningsMinor: string
          balances: BalanceSnapshot[]
          batchLines: EntryLine[][]
          original?: { id: string; journalIds: string[] }
        }) {
          return db.$transaction(
            async (tx) => {
              const current = await tx.financeBook.findUniqueOrThrow({
                where: { id: bookId },
              })
              const snapshotSequence = current.lastSequence
              const eventId = randomUUID()
              const event = await tx.financeFiscalCloseEvent.create({
                data: {
                  id: eventId,
                  bookId,
                  fiscalYearId: input.fiscalYearId,
                  kind: input.kind,
                  clientCommandId: `report-${input.kind.toLowerCase()}-${runId}-${eventId}`,
                  retainedEarningsAccountId: retained.id,
                  snapshotSequence,
                  resultingSequence:
                    snapshotSequence + BigInt(input.batchLines.length),
                  earningsMinor: input.earningsMinor,
                  accountBalances: [...input.balances].sort((a, b) =>
                    a.accountId < b.accountId
                      ? -1
                      : a.accountId > b.accountId
                        ? 1
                        : 0,
                  ),
                  sourceEvidence: { fixture: "synthetic-report-batch", runId },
                  reason: "Synthetic QA report preservation event",
                  actorUserId: actor.actorUserId,
                  effectiveAt: input.effectiveAt,
                  ...(input.original
                    ? { reversalOfId: input.original.id }
                    : {}),
                },
              })
              const journalIds: string[] = []
              for (const [position, lines] of input.batchLines.entries()) {
                const sequence = snapshotSequence + BigInt(position + 1)
                const entry = await tx.financeJournalEntry.create({
                  data: {
                    bookId,
                    sequence,
                    sourceKind:
                      input.kind === "CLOSE"
                        ? FINANCE_FISCAL_CLOSE_SOURCE
                        : FINANCE_FISCAL_REVERSE_SOURCE,
                    sourceId: `${event.id}:${position}`,
                    payloadHash: randomUUID(),
                    description: "Synthetic QA fiscal close batch",
                    actorUserId: actor.actorUserId,
                    effectiveAt: input.effectiveAt,
                    ...(input.original
                      ? { reversalOfId: input.original.journalIds[position] }
                      : {}),
                  },
                })
                await tx.financeJournalLine.createMany({
                  data: lines.map((line) => ({
                    bookId,
                    entryId: entry.id,
                    accountId: line.accountId,
                    debitMinor: line.debitMinor,
                    creditMinor: line.creditMinor,
                  })),
                })
                await tx.financeFiscalCloseJournal.create({
                  data: {
                    bookId,
                    eventId: event.id,
                    journalEntryId: entry.id,
                    position,
                  },
                })
                journalIds.push(entry.id)
              }
              await tx.financeBook.update({
                where: { id: bookId },
                data: {
                  lastSequence:
                    snapshotSequence + BigInt(input.batchLines.length),
                },
              })
              await tx.financeFiscalYear.update({
                where: { id: input.fiscalYearId },
                data: {
                  activeCloseId: input.kind === "CLOSE" ? event.id : null,
                },
              })
              return { id: event.id, journalIds }
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }

        const year1Balances = [
          {
            accountId: cost.id,
            closingDebitMinor: "6000",
            closingCreditMinor: "0",
          },
          {
            accountId: sales.id,
            closingDebitMinor: "0",
            closingCreditMinor: "9000",
          },
        ]
        const year1CloseLines: EntryLine[][] = [
          [
            { accountId: sales.id, debitMinor: 6000n, creditMinor: 0n },
            { accountId: cost.id, debitMinor: 0n, creditMinor: 6000n },
          ],
          [
            { accountId: sales.id, debitMinor: 3000n, creditMinor: 0n },
            { accountId: retained.id, debitMinor: 0n, creditMinor: 3000n },
          ],
        ]
        const year1Close = await persistEvent({
          kind: "CLOSE",
          fiscalYearId: year1.id,
          effectiveAt: year1.endsAt,
          earningsMinor: "3000",
          balances: year1Balances,
          batchLines: year1CloseLines,
        })
        const closedBook = await db.financeBook.findUniqueOrThrow({
          where: { id: bookId },
        })
        await expect(
          getFinanceReports(db, { ...year1Range, tenantId: randomUUID() }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(
          getFinanceReports(db, {
            ...year1Range,
            snapshotSequence: (closedBook.lastSequence + 1n).toString(),
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        await expect(
          getFinanceReports(db, {
            ...year1Range,
            snapshotSequence: (closedBook.lastSequence - 1n).toString(),
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          await getFinanceReports(db, {
            ...year1Range,
            snapshotSequence: beforeClose.snapshotSequence,
          }),
        ).toEqual(beforeClose)
        const afterClose = await getFinanceReports(db, year1Range)
        expect(periodPnl(afterClose.profitAndLoss)).toEqual(
          periodPnl(beforeClose.profitAndLoss),
        )
        expect(afterClose.trialBalance.balanced).toBe(true)
        expect(afterClose.trialBalance.debitMinor).toBe(
          afterClose.trialBalance.creditMinor,
        )
        expect(afterClose.balanceSheet).toMatchObject({
          postedEquityMinor: "13000",
          unclosedEarningsMinor: "0",
          totalEquityMinor: "13000",
          balanced: true,
        })
        expect(
          afterClose.trialBalance.accounts.find(
            (row) => row.accountId === sales.id,
          ),
        ).toMatchObject({
          closingBalanceMinor: "0",
          periodDebitMinor: "10000",
          periodCreditMinor: "19000",
        })
        const salesLedger = await listFinanceAccountLedger(db, {
          ...year1Range,
          accountId: sales.id,
          snapshotSequence: afterClose.snapshotSequence,
        })
        expect(salesLedger.debitMinor).toBe("10000")
        expect(salesLedger.creditMinor).toBe("19000")

        const year1ReverseLines: EntryLine[][] = [
          [
            { accountId: cost.id, debitMinor: 6000n, creditMinor: 0n },
            { accountId: sales.id, debitMinor: 0n, creditMinor: 6000n },
          ],
          [
            { accountId: retained.id, debitMinor: 3000n, creditMinor: 0n },
            { accountId: sales.id, debitMinor: 0n, creditMinor: 3000n },
          ],
        ]
        await persistEvent({
          kind: "REVERSE",
          fiscalYearId: year1.id,
          effectiveAt: year1.endsAt,
          earningsMinor: "3000",
          balances: year1Balances,
          batchLines: year1ReverseLines,
          original: year1Close,
        })
        const reopenedPreview = await getFinanceYearEndPreview(db, {
          ...actor,
          bookId,
        })
        expect(reopenedPreview.reclose).toBe(true)
        expect(reopenedPreview.fiscalYearId).toBe(year1.id)
        expect(reopenedPreview.fiscalStart).toEqual(year1.startsAt)
        expect(reopenedPreview.fiscalEnd).toEqual(year1.endsAt)
        expect(reopenedPreview.earningsMinor).toBe("3000")
        expect(reopenedPreview.canClose).toBe(false)
        const afterReverse = await getFinanceReports(db, year1Range)
        expect(periodPnl(afterReverse.profitAndLoss)).toEqual(
          periodPnl(beforeClose.profitAndLoss),
        )
        expect(afterReverse.balanceSheet).toMatchObject({
          postedEquityMinor: "10000",
          unclosedEarningsMinor: "3000",
          totalEquityMinor: "13000",
          balanced: true,
        })
        await persistEvent({
          kind: "CLOSE",
          fiscalYearId: year1.id,
          effectiveAt: year1.endsAt,
          earningsMinor: "3000",
          balances: year1Balances,
          batchLines: year1CloseLines,
        })
        const afterReclose = await getFinanceReports(db, year1Range)
        expect(periodPnl(afterReclose.profitAndLoss)).toEqual(
          periodPnl(beforeClose.profitAndLoss),
        )
        expect(afterReclose.balanceSheet).toMatchObject({
          postedEquityMinor: "13000",
          unclosedEarningsMinor: "0",
          totalEquityMinor: "13000",
          balanced: true,
        })

        const year2 = await db.financeFiscalYear.create({
          data: {
            bookId,
            calendarId: calendar.id,
            calendarRevision: calendar.revision,
            startMonth: calendar.startMonth,
            startDay: calendar.startDay,
            startsAt: new Date("2024-10-01T00:00:00.000Z"),
            endsAt: new Date("2025-09-30T23:59:59.999Z"),
            firstPeriodStub: false,
          },
        })

        await postJournal("loss-income", new Date("2025-02-01T12:00:00.000Z"), [
          { accountId: cash.id, debitMinor: 1000n, creditMinor: 0n },
          { accountId: sales.id, debitMinor: 0n, creditMinor: 1000n },
        ])
        await postJournal(
          "loss-expense",
          new Date("2025-03-01T12:00:00.000Z"),
          [
            { accountId: cost.id, debitMinor: 2500n, creditMinor: 0n },
            { accountId: cash.id, debitMinor: 0n, creditMinor: 2500n },
          ],
        )
        const year2Balances = [
          {
            accountId: cost.id,
            closingDebitMinor: "2500",
            closingCreditMinor: "0",
          },
          {
            accountId: sales.id,
            closingDebitMinor: "0",
            closingCreditMinor: "1000",
          },
        ]
        const year2Close = await persistEvent({
          kind: "CLOSE",
          fiscalYearId: year2.id,
          effectiveAt: year2.endsAt,
          earningsMinor: "-1500",
          balances: year2Balances,
          batchLines: [
            [
              { accountId: sales.id, debitMinor: 1000n, creditMinor: 0n },
              { accountId: retained.id, debitMinor: 1500n, creditMinor: 0n },
              { accountId: cost.id, debitMinor: 0n, creditMinor: 2500n },
            ],
          ],
        })
        const year2Report = await getFinanceReports(db, {
          ...actor,
          bookId,
          from: year2.startsAt,
          through: year2.endsAt,
        })
        expect(year2Report.profitAndLoss).toMatchObject({
          revenueMinor: "1000",
          costOfSalesMinor: "2500",
          netProfitMinor: "-1500",
        })
        expect(year2Report.balanceSheet).toMatchObject({
          postedEquityMinor: "11500",
          unclosedEarningsMinor: "0",
        })
        expect(year2Close.journalIds).toHaveLength(1)

        const year3 = await db.financeFiscalYear.create({
          data: {
            bookId,
            calendarId: calendar.id,
            calendarRevision: calendar.revision,
            startMonth: calendar.startMonth,
            startDay: calendar.startDay,
            startsAt: new Date("2025-10-01T00:00:00.000Z"),
            endsAt: new Date("2026-09-30T23:59:59.999Z"),
            firstPeriodStub: false,
          },
        })

        await postJournal("zero-income", new Date("2026-02-01T12:00:00.000Z"), [
          { accountId: cash.id, debitMinor: 1000n, creditMinor: 0n },
          { accountId: sales.id, debitMinor: 0n, creditMinor: 1000n },
        ])
        await postJournal(
          "zero-expense",
          new Date("2026-03-01T12:00:00.000Z"),
          [
            { accountId: cost.id, debitMinor: 1000n, creditMinor: 0n },
            { accountId: cash.id, debitMinor: 0n, creditMinor: 1000n },
          ],
        )
        const year3Balances = [
          {
            accountId: cost.id,
            closingDebitMinor: "1000",
            closingCreditMinor: "0",
          },
          {
            accountId: sales.id,
            closingDebitMinor: "0",
            closingCreditMinor: "1000",
          },
        ]
        await persistEvent({
          kind: "CLOSE",
          fiscalYearId: year3.id,
          effectiveAt: year3.endsAt,
          earningsMinor: "0",
          balances: year3Balances,
          batchLines: [
            [
              { accountId: sales.id, debitMinor: 1000n, creditMinor: 0n },
              { accountId: cost.id, debitMinor: 0n, creditMinor: 1000n },
            ],
          ],
        })
        const finalReport = await getFinanceReports(db, {
          ...actor,
          bookId,
          from: book.startsAt,
          through: year3.endsAt,
        })
        expect(finalReport.profitAndLoss).toMatchObject({
          revenueMinor: "11000",
          costOfSalesMinor: "9500",
          netProfitMinor: "1500",
        })
        expect(finalReport.trialBalance.balanced).toBe(true)
        expect(finalReport.balanceSheet).toMatchObject({
          postedEquityMinor: "11500",
          unclosedEarningsMinor: "0",
          totalEquityMinor: "11500",
          balanced: true,
        })

        const preview = await getFinanceYearEndPreview(db, { ...actor, bookId })
        expect(preview.fiscalStart).toEqual(new Date("2026-10-01T00:00:00Z"))
        expect(preview.fiscalEnd).toEqual(new Date("2027-09-30T23:59:59.999Z"))
        expect(preview.reclose).toBe(false)
        expect(preview.ledgerFrom).toEqual(book.startsAt)
        expect(preview.earningsMinor).toBe("0")
        expect(preview.journals).toEqual([])
        expect(preview.canClose).toBe(false)
        expect(preview.completeness).toBe("INCOMPLETE_SOURCE_COVERAGE")

        // Corrupt only the owned QA original source while keeping its journal
        // balanced. Valid batch metadata cannot hide an uncleared original balance.
        await db.financeJournalLine.updateMany({
          where: { bookId, entryId: firstIncome.id, accountId: cash.id },
          data: { debitMinor: { increment: 1n } },
        })
        await db.financeJournalLine.updateMany({
          where: { bookId, entryId: firstIncome.id, accountId: sales.id },
          data: { creditMinor: { increment: 1n } },
        })
        await expect(
          getFinanceYearEndPreview(db, { ...actor, bookId }),
        ).rejects.toThrow("did not clear its temporary balances")
        await db.financeJournalLine.updateMany({
          where: { bookId, entryId: firstIncome.id, accountId: cash.id },
          data: { debitMinor: { decrement: 1n } },
        })
        await db.financeJournalLine.updateMany({
          where: { bookId, entryId: firstIncome.id, accountId: sales.id },
          data: { creditMinor: { decrement: 1n } },
        })

        // A source prefix lookalike without a link and a wrong tag on a linked
        // batch both fail closed rather than disappearing from historical P&L.
        const lookalike = await postJournal(
          "lookalike",
          year3.endsAt,
          [
            { accountId: sales.id, debitMinor: 1n, creditMinor: 0n },
            { accountId: cost.id, debitMinor: 0n, creditMinor: 1n },
          ],
          "FISCAL_YEAR_CLOSE_LOOKALIKE",
        )
        await expect(
          getFinanceReports(db, {
            ...actor,
            bookId,
            from: year3.startsAt,
            through: year3.endsAt,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await db.financeJournalEntry.update({
          where: { id: lookalike.id },
          data: { sourceKind: "QA_FISCAL_REPORT_SOURCE" },
        })

        const linkedCloseJournal =
          await db.financeFiscalCloseJournal.findFirstOrThrow({
            where: { eventId: year1Close.id, position: 0 },
            include: { journalEntry: true },
          })
        await db.financeJournalEntry.update({
          where: { id: linkedCloseJournal.journalEntryId },
          data: { sourceKind: "FISCAL_YEAR_CLOSE_LOOKALIKE" },
        })
        await expect(getFinanceReports(db, year1Range)).rejects.toMatchObject({
          code: "CONFLICT",
        })
        await db.financeJournalEntry.update({
          where: { id: linkedCloseJournal.journalEntryId },
          data: { sourceKind: FINANCE_FISCAL_CLOSE_SOURCE },
        })
        await db.financeFiscalCloseJournal.delete({
          where: { journalEntryId: linkedCloseJournal.journalEntryId },
        })
        await expect(getFinanceReports(db, year1Range)).rejects.toMatchObject({
          code: "CONFLICT",
        })
      } finally {
        const discoveredUsers = await db.user.findMany({
          where: { OR: [{ email: userEmail }, { id: { in: userIds } }] },
          select: { id: true },
        })
        const ownedUserIds = [
          ...new Set([...userIds, ...discoveredUsers.map((row) => row.id)]),
        ]
        const discoveredTenants = await db.tenant.findMany({
          where: { OR: [{ slug: tenantSlug }, { id: { in: tenantIds } }] },
          select: { id: true },
        })
        const ownedTenantIds = [
          ...new Set([...tenantIds, ...discoveredTenants.map((row) => row.id)]),
        ]
        const discoveredBooks = await db.financeBook.findMany({
          where: { tenantId: { in: ownedTenantIds } },
          select: { id: true },
        })
        const ownedBookIds = [
          ...new Set([...bookIds, ...discoveredBooks.map((row) => row.id)]),
        ]
        for (const ownedBookId of ownedBookIds) {
          await db.$transaction(
            async (tx) => {
              await tx.financeFiscalCloseJournal.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeFiscalYear.updateMany({
                where: { bookId: ownedBookId },
                data: { activeCloseId: null },
              })
              await tx.financeFiscalCloseEvent.deleteMany({
                where: { bookId: ownedBookId, kind: "REVERSE" },
              })
              await tx.financeFiscalCloseEvent.deleteMany({
                where: { bookId: ownedBookId, kind: "CLOSE" },
              })
              await tx.financeFiscalYear.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeFiscalCalendar.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeReconciliation.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financePeriod.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeCommand.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeJournalLine.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId: ownedBookId, reversalOfId: { not: null } },
              })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeAccount.deleteMany({
                where: { bookId: ownedBookId },
              })
              await tx.financeBook.deleteMany({ where: { id: ownedBookId } })
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }
        for (const ownedTenantId of ownedTenantIds)
          await db.tenant.deleteMany({ where: { id: ownedTenantId } })
        for (const userId of ownedUserIds)
          await db.user.deleteMany({ where: { id: userId } })
        for (const ownedTenantId of ownedTenantIds)
          expect(await db.tenant.count({ where: { id: ownedTenantId } })).toBe(
            0,
          )
        expect(
          await db.membership.count({
            where: {
              OR: [
                { tenantId: { in: ownedTenantIds } },
                { userId: { in: ownedUserIds } },
              ],
            },
          }),
        ).toBe(0)
        for (const userId of ownedUserIds) {
          expect(await db.membership.count({ where: { userId } })).toBe(0)
          expect(await db.user.count({ where: { id: userId } })).toBe(0)
        }
        for (const ownedBookId of ownedBookIds) {
          expect(
            await db.financeBook.count({ where: { id: ownedBookId } }),
          ).toBe(0)
          expect(
            await db.financeAccount.count({ where: { bookId: ownedBookId } }),
          ).toBe(0)
          expect(
            await db.financeFiscalCalendar.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financeFiscalYear.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financeFiscalCloseEvent.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financeFiscalCloseJournal.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financeCommand.count({ where: { bookId: ownedBookId } }),
          ).toBe(0)
          expect(
            await db.financeReconciliation.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financePeriod.count({ where: { bookId: ownedBookId } }),
          ).toBe(0)
          expect(
            await db.financeJournalEntry.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financeJournalLine.count({
              where: { bookId: ownedBookId },
            }),
          ).toBe(0)
          expect(
            await db.financeAccount.count({ where: { bookId: ownedBookId } }),
          ).toBe(0)
        }
        expect(await db.user.count({ where: { email: userEmail } })).toBe(0)
        expect(await db.tenant.count({ where: { slug: tenantSlug } })).toBe(0)
        if (ownedBookId)
          expect(
            await db.financeBook.count({ where: { id: ownedBookId } }),
          ).toBe(0)
      }
    }, 240_000)
  },
)
