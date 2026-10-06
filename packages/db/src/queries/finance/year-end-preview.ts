import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { getFinanceClosingCashEvidenceInTransaction } from "./closing-cash-evidence"
import { resolveFinanceFiscalHistoryPeriod } from "./fiscal-history"
import {
  FINANCE_FISCAL_MAX_ACCOUNTS,
  FINANCE_FISCAL_MAX_JOURNALS,
  FINANCE_FISCAL_MAX_YEARS,
} from "./fiscal-limits"
import { getFinanceReportsInTransaction } from "./reports"
import { FinanceError } from "./rules"
import { composeFinanceYearEndPostings } from "./year-end-postings"

// A family without a complete source reader stays unverified, even in an empty
// posted journal. A balanced journal cannot prove that source records were posted.
const SOURCE_GAPS = [
  "CASH_AND_BANK_RECONCILIATION",
  "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
  "SUPPLIER_DOCUMENTS_AND_SETTLEMENTS",
  "INVENTORY_COSTS",
  "OPENING_BALANCE_RECONCILIATION",
  "ASSETS_LOANS_ACCRUALS_AND_TAX",
] as const

/** Read-only fiscal calculation; never an authority for a source-complete close. */
export async function getFinanceYearEndPreview(
  db: PrismaClient,
  supplied: FinanceActor & { bookId: string },
) {
  const input = { ...supplied }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
      if (!book || book.id !== input.bookId)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const calendar = await tx.financeFiscalCalendar.findUnique({
        where: { bookId: book.id },
      })
      if (!calendar)
        throw new FinanceError(
          "CONFLICT",
          "Configure the fiscal calendar before previewing year-end.",
        )
      if (
        calendar.bookId !== book.id ||
        !Number.isInteger(calendar.revision) ||
        calendar.revision < 1
      )
        throw new FinanceError("CONFLICT", "Fiscal settings are invalid.")
      const [years, events] = await Promise.all([
        tx.financeFiscalYear.findMany({
          where: { bookId: book.id },
          orderBy: { startsAt: "asc" },
          take: FINANCE_FISCAL_MAX_YEARS + 1,
        }),
        tx.financeFiscalCloseEvent.findMany({
          where: { bookId: book.id },
          take: FINANCE_FISCAL_MAX_YEARS * 4 + 1,
          orderBy: [{ resultingSequence: "asc" }, { id: "asc" }],
          select: {
            id: true,
            bookId: true,
            fiscalYearId: true,
            kind: true,
            retainedEarningsAccountId: true,
            snapshotSequence: true,
            resultingSequence: true,
            effectiveAt: true,
            recordedAt: true,
            reversalOfId: true,
          },
        }),
      ])
      const yearIds = new Set(years.map((year) => year.id))
      if (
        events.length > FINANCE_FISCAL_MAX_YEARS * 4 ||
        events.some((event) => !yearIds.has(event.fiscalYearId))
      )
        throw new FinanceError(
          "CONFLICT",
          "Fiscal history scope is incomplete.",
        )
      const accountCount = await tx.financeAccount.count({
        where: { bookId: book.id },
      })
      if (accountCount > FINANCE_FISCAL_MAX_ACCOUNTS)
        throw new FinanceError(
          "CONFLICT",
          "The complete account review exceeds the year-end preview limit.",
        )
      const accounts = await tx.financeAccount.findMany({
        where: { bookId: book.id },
        orderBy: { code: "asc" },
        take: FINANCE_FISCAL_MAX_ACCOUNTS + 1,
      })
      if (
        accounts.length !== accountCount ||
        new Set(accounts.map((account) => account.id)).size !== accountCount ||
        accounts.some((account) => account.bookId !== book.id)
      )
        throw new FinanceError(
          "CONFLICT",
          "The complete account scope changed.",
        )
      const retained = accounts.filter(
        (account) => account.purpose === "RETAINED_EARNINGS",
      )
      const target = retained[0]
      if (
        retained.length !== 1 ||
        !target ||
        target.id !== calendar.retainedEarningsAccountId ||
        target.kind !== "EQUITY" ||
        target.archivedAt !== null
      )
        throw new FinanceError(
          "CONFLICT",
          "Restore the original active equity retained-earnings control.",
        )
      const period = resolveFinanceFiscalHistoryPeriod({
        bookId: book.id,
        calendar,
        bookStartsAt: book.startsAt,
        snapshotSequence: book.lastSequence,
        years: years.map((year) => ({
          ...year,
          events: events.filter((event) => event.fiscalYearId === year.id),
        })),
        now: new Date(),
      })
      // Read the full original history so every prior batch is integrity-checked
      // by the report reader. Closing balances remain cumulative for the preview.
      const report = await getFinanceReportsInTransaction(tx, {
        ...input,
        from: book.startsAt,
        through: period.fiscalEnd,
        snapshotSequence: book.lastSequence.toString(),
      })
      const rows = report.trialBalance.accounts
      const byId = new Map(rows.map((row) => [row.accountId, row]))
      if (
        report.bookId !== book.id ||
        report.currencyCode !== book.currencyCode ||
        report.snapshotSequence !== book.lastSequence.toString() ||
        report.from.getTime() !== book.startsAt.getTime() ||
        report.through.getTime() !== period.fiscalEnd.getTime() ||
        rows.length !== accountCount ||
        byId.size !== accountCount ||
        accounts.some((account) => {
          const row = byId.get(account.id)
          return (
            !row || row.kind !== account.kind || row.purpose !== account.purpose
          )
        })
      )
        throw new FinanceError("CONFLICT", "The year-end report scope changed.")
      if (!report.trialBalance.balanced || !report.balanceSheet.balanced)
        throw new FinanceError(
          "CONFLICT",
          "Resolve the posted trial balance and financial-position difference.",
        )
      if (events.length) {
        // Relational batch metadata must agree with the actual original ledger:
        // every original CLOSE cleared every temporary balance at its watermark.
        const uncleared = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT event.id
          FROM "FinanceFiscalCloseEvent" event
          JOIN "FinanceFiscalYear" year ON year.id = event."fiscalYearId" AND year."bookId" = event."bookId"
          JOIN "FinanceJournalLine" line ON line."bookId" = event."bookId"
          JOIN "FinanceAccount" account ON account.id = line."accountId" AND account."bookId" = line."bookId"
          JOIN "FinanceJournalEntry" entry ON entry.id = line."entryId" AND entry."bookId" = line."bookId"
          WHERE event."bookId" = ${book.id} AND event.kind = 'CLOSE'
            AND account.kind IN ('INCOME', 'EXPENSE')
            AND entry.sequence <= event."resultingSequence" AND entry."effectiveAt" <= year."endsAt"
          GROUP BY event.id, line."accountId"
          HAVING SUM(line."debitMinor" - line."creditMinor") <> 0
          LIMIT 1
        `
        if (uncleared.length)
          throw new FinanceError(
            "CONFLICT",
            "An original fiscal close did not clear its temporary balances.",
          )
      }
      const composition = composeFinanceYearEndPostings({
        bookId: book.id,
        retainedEarnings: {
          accountId: target.id,
          bookId: target.bookId,
          kind: target.kind,
          purpose: target.purpose,
          archivedAt: target.archivedAt,
        },
        temporaryAccounts: accounts
          .filter((account) => ["INCOME", "EXPENSE"].includes(account.kind))
          .map((account) => {
            const row = byId.get(account.id)
            if (!row)
              throw new FinanceError(
                "CONFLICT",
                "A temporary account is missing.",
              )
            return {
              accountId: account.id,
              bookId: account.bookId,
              kind: account.kind,
              archivedAt: account.archivedAt,
              closingDebitMinor: row.closingDebitMinor,
              closingCreditMinor: row.closingCreditMinor,
            }
          }),
      })
      if (
        BigInt(composition.journalCount) > BigInt(FINANCE_FISCAL_MAX_JOURNALS)
      )
        throw new FinanceError(
          "CONFLICT",
          "The complete year-end transfer exceeds the atomic batch limit.",
        )
      const cashEvidence = await getFinanceClosingCashEvidenceInTransaction(
        tx,
        {
          bookId: book.id,
          through: period.fiscalEnd,
          snapshotSequence: book.lastSequence,
          accounts: rows,
          now: new Date(),
        },
      )
      const journals = [...composition.journals]
      return {
        bookId: book.id,
        currencyCode: book.currencyCode,
        snapshotSequence: report.snapshotSequence,
        ledgerFrom: report.from,
        calendarRevision: calendar.revision,
        retainedEarningsAccountId: target.id,
        ...period,
        // Ordinary date locks are disclosed, never treated as fiscal evidence.
        closedThrough: book.closedThrough,
        earningsMinor: composition.earningsMinor,
        journalCount: composition.journalCount.toString(),
        journals,
        temporaryAccounts: rows.filter((row) =>
          ["INCOME", "EXPENSE"].includes(row.kind),
        ),
        trialBalance: report.trialBalance,
        balanceSheet: report.balanceSheet,
        cashEvidence,
        sourceCoverage: "POSTED_FINANCE_ENTRIES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
        coverageGaps: [...SOURCE_GAPS],
        operationallyReconciled: false as const,
        canClose: false as const,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
