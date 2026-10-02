import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { type CashFlowGroup, calculateCashFlow } from "./cash-flow"
import { calculateFinancialPosition } from "./financial-position"
import {
  FINANCE_FISCAL_MAX_JOURNALS,
  FINANCE_FISCAL_MAX_JOURNAL_LINES,
  FINANCE_FISCAL_MAX_YEARS,
} from "./fiscal-limits"
import { getFinanceFiscalPnlExclusions } from "./fiscal-report-integrity"
import { FinanceError } from "./rules"

export type FinanceReportInput = FinanceActor & {
  bookId: string
  from: Date
  through: Date
  snapshotSequence?: string
}

function validateReportInput(input: FinanceReportInput) {
  if (
    !Number.isFinite(input.from.getTime()) ||
    !Number.isFinite(input.through.getTime()) ||
    input.through < input.from ||
    (input.snapshotSequence !== undefined &&
      (!/^(0|[1-9]\d{0,18})$/.test(input.snapshotSequence) ||
        BigInt(input.snapshotSequence) > BigInt("9223372036854775807")))
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a valid reporting period and snapshot.",
    )
  }
}

export async function getFinanceReports(
  db: PrismaClient,
  input: FinanceReportInput,
) {
  validateReportInput(input)
  return db.$transaction((tx) => getFinanceReportsInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
    isolationLevel: "RepeatableRead",
  })
}

/** Repository composition only; keep checklist/report facts in one database snapshot. */
export async function getFinanceReportsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceReportInput,
) {
  validateReportInput(input)
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const snapshot =
    input.snapshotSequence === undefined
      ? book.lastSequence
      : BigInt(input.snapshotSequence)
  if (snapshot > book.lastSequence || input.from < book.startsAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Reports must begin on or after bookkeeping starts and use an existing snapshot.",
    )
  const aggregate = (
    effectiveAt: Prisma.DateTimeFilter,
    excludedIds?: string[],
  ) =>
    tx.financeJournalLine.groupBy({
      by: ["accountId"],
      where: {
        bookId: book.id,
        entry: {
          sequence: { lte: snapshot },
          effectiveAt,
          ...(excludedIds?.length ? { id: { notIn: excludedIds } } : {}),
        },
      },
      _sum: { debitMinor: true, creditMinor: true },
    })
  const MAX_REPORT_FISCAL_EVENTS = FINANCE_FISCAL_MAX_YEARS * 4
  const MAX_REPORT_FISCAL_TAGS =
    MAX_REPORT_FISCAL_EVENTS * FINANCE_FISCAL_MAX_JOURNALS
  const [accounts, closing, movement, cashGroups, fiscalEvents, taggedEntries] =
    await Promise.all([
      tx.financeAccount.findMany({
        where: { bookId: book.id },
        orderBy: { code: "asc" },
      }),
      aggregate({ lte: input.through }),
      aggregate({ gte: input.from, lte: input.through }),
      tx.$queryRaw<
        Array<Omit<CashFlowGroup, "netMinor"> & { netMinor: string }>
      >`
      SELECT COALESCE(original."sourceKind", entry."sourceKind") AS "sourceKind",
        SUM(line."debitMinor" - line."creditMinor")::text AS "netMinor"
      FROM "FinanceJournalLine" line
      JOIN "FinanceAccount" account ON account.id = line."accountId" AND account."bookId" = line."bookId"
      JOIN "FinanceJournalEntry" entry ON entry.id = line."entryId" AND entry."bookId" = line."bookId"
      LEFT JOIN "FinanceJournalEntry" original ON original.id = entry."reversalOfId" AND original."bookId" = entry."bookId"
      WHERE line."bookId" = ${book.id} AND account.purpose IN ('CASH', 'BANK')
        AND entry.sequence <= ${snapshot} AND entry."effectiveAt" >= ${input.from} AND entry."effectiveAt" <= ${input.through}
      GROUP BY COALESCE(original."sourceKind", entry."sourceKind")
      ORDER BY COALESCE(original."sourceKind", entry."sourceKind")
    `,
      tx.financeFiscalCloseEvent.findMany({
        where: {
          bookId: book.id,
          OR: [
            { effectiveAt: { gte: input.from, lte: input.through } },
            {
              snapshotSequence: { lt: snapshot },
              resultingSequence: { gt: snapshot },
            },
            {
              journals: {
                some: {
                  bookId: book.id,
                  journalEntry: {
                    sequence: { lte: snapshot },
                    effectiveAt: { gte: input.from, lte: input.through },
                  },
                },
              },
            },
          ],
        },
        orderBy: [{ resultingSequence: "asc" }, { id: "asc" }],
        take: MAX_REPORT_FISCAL_EVENTS + 1,
        select: {
          id: true,
          bookId: true,
          fiscalYearId: true,
          kind: true,
          snapshotSequence: true,
          resultingSequence: true,
          effectiveAt: true,
          recordedAt: true,
          retainedEarningsAccountId: true,
          accountBalances: true,
          earningsMinor: true,
          reversalOfId: true,
          fiscalYear: {
            select: {
              id: true,
              bookId: true,
              calendarId: true,
              calendarRevision: true,
              startMonth: true,
              startDay: true,
              startsAt: true,
              endsAt: true,
              firstPeriodStub: true,
              calendar: {
                select: {
                  id: true,
                  bookId: true,
                  startMonth: true,
                  startDay: true,
                  revision: true,
                  retainedEarningsAccountId: true,
                },
              },
            },
          },
          retainedEarningsAccount: {
            select: { id: true, bookId: true, kind: true, purpose: true },
          },
          reversalOf: {
            select: {
              id: true,
              bookId: true,
              fiscalYearId: true,
              kind: true,
              retainedEarningsAccountId: true,
              accountBalances: true,
              earningsMinor: true,
              snapshotSequence: true,
              resultingSequence: true,
              effectiveAt: true,
              journals: {
                orderBy: { position: "asc" },
                take: FINANCE_FISCAL_MAX_JOURNALS + 1,
                select: {
                  bookId: true,
                  eventId: true,
                  position: true,
                  journalEntry: {
                    select: {
                      id: true,
                      bookId: true,
                      sequence: true,
                      sourceKind: true,
                      reversalOfId: true,
                      effectiveAt: true,
                      lines: {
                        orderBy: { id: "asc" },
                        take: FINANCE_FISCAL_MAX_JOURNAL_LINES + 1,
                        select: {
                          accountId: true,
                          bookId: true,
                          debitMinor: true,
                          creditMinor: true,
                          account: {
                            select: {
                              id: true,
                              bookId: true,
                              kind: true,
                              purpose: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          journals: {
            orderBy: { position: "asc" },
            take: FINANCE_FISCAL_MAX_JOURNALS + 1,
            select: {
              bookId: true,
              eventId: true,
              position: true,
              journalEntry: {
                select: {
                  id: true,
                  bookId: true,
                  sequence: true,
                  sourceKind: true,
                  reversalOfId: true,
                  effectiveAt: true,
                  lines: {
                    orderBy: { id: "asc" },
                    take: FINANCE_FISCAL_MAX_JOURNAL_LINES + 1,
                    select: {
                      accountId: true,
                      bookId: true,
                      debitMinor: true,
                      creditMinor: true,
                      account: {
                        select: {
                          id: true,
                          bookId: true,
                          kind: true,
                          purpose: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      tx.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sequence: { lte: snapshot },
          effectiveAt: { gte: input.from, lte: input.through },
          sourceKind: { startsWith: "FISCAL_YEAR_" },
        },
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
        take: MAX_REPORT_FISCAL_TAGS + 1,
        select: {
          id: true,
          bookId: true,
          sequence: true,
          sourceKind: true,
          effectiveAt: true,
          fiscalCloseJournal: {
            select: { bookId: true, eventId: true, position: true },
          },
        },
      }),
    ])
  if (
    fiscalEvents.length > MAX_REPORT_FISCAL_EVENTS ||
    taggedEntries.length > MAX_REPORT_FISCAL_TAGS ||
    new Set(fiscalEvents.map((event) => event.fiscalYearId)).size >
      FINANCE_FISCAL_MAX_YEARS
  )
    throw new FinanceError(
      "CONFLICT",
      "The fiscal close history exceeds the report integrity bound.",
    )
  const excludedFiscalEntryIds = getFinanceFiscalPnlExclusions({
    bookId: book.id,
    bookStartsAt: book.startsAt,
    calendar: await tx.financeFiscalCalendar.findUnique({
      where: { bookId: book.id },
      select: {
        id: true,
        bookId: true,
        startMonth: true,
        startDay: true,
        revision: true,
        retainedEarningsAccountId: true,
      },
    }),
    snapshotSequence: snapshot,
    accounts,
    events: fiscalEvents,
    taggedEntries,
  })
  const profitMovement = excludedFiscalEntryIds.size
    ? await aggregate({ gte: input.from, lte: input.through }, [
        ...excludedFiscalEntryIds,
      ])
    : movement
  const closingByAccount = new Map(
    closing.map((row) => [row.accountId, row._sum]),
  )
  const movementByAccount = new Map(
    movement.map((row) => [row.accountId, row._sum]),
  )
  const profitMovementByAccount = new Map(
    profitMovement.map((row) => [row.accountId, row._sum]),
  )
  let totalDebit = BigInt(0)
  let totalCredit = BigInt(0)
  let revenue = BigInt(0)
  let costOfSales = BigInt(0)
  let expenses = BigInt(0)
  const rows = accounts.map((account) => {
    const total = closingByAccount.get(account.id)
    const period = movementByAccount.get(account.id)
    const debit = total?.debitMinor ?? BigInt(0)
    const credit = total?.creditMinor ?? BigInt(0)
    const netDebit = debit - credit
    const closingDebit = netDebit > BigInt(0) ? netDebit : BigInt(0)
    const closingCredit = netDebit < BigInt(0) ? -netDebit : BigInt(0)
    totalDebit += closingDebit
    totalCredit += closingCredit
    const periodDebit = period?.debitMinor ?? BigInt(0)
    const periodCredit = period?.creditMinor ?? BigInt(0)
    const debitNormal = account.kind === "ASSET" || account.kind === "EXPENSE"
    const periodBalance = debitNormal
      ? periodDebit - periodCredit
      : periodCredit - periodDebit
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      kind: account.kind,
      purpose: account.purpose,
      closingDebitMinor: closingDebit.toString(),
      closingCreditMinor: closingCredit.toString(),
      closingBalanceMinor: (debitNormal ? netDebit : -netDebit).toString(),
      periodDebitMinor: periodDebit.toString(),
      periodCreditMinor: periodCredit.toString(),
      periodBalanceMinor: periodBalance.toString(),
    }
  })
  const rowByAccount = new Map(rows.map((row) => [row.accountId, row]))
  const profitAndLossAccounts = accounts
    .filter(
      (account) => account.kind === "INCOME" || account.kind === "EXPENSE",
    )
    .map((account) => {
      const row = rowByAccount.get(account.id)
      if (!row)
        throw new FinanceError(
          "CONFLICT",
          "Report account snapshot is incomplete.",
        )
      const totals = profitMovementByAccount.get(account.id)
      const periodDebit = totals?.debitMinor ?? BigInt(0)
      const periodCredit = totals?.creditMinor ?? BigInt(0)
      const debitNormal = account.kind === "EXPENSE"
      const periodBalance = debitNormal
        ? periodDebit - periodCredit
        : periodCredit - periodDebit
      if (account.kind === "INCOME") revenue += periodBalance
      else if (account.purpose === "COST_OF_SALES") costOfSales += periodBalance
      else expenses += periodBalance
      return {
        ...row,
        periodDebitMinor: periodDebit.toString(),
        periodCreditMinor: periodCredit.toString(),
        periodBalanceMinor: periodBalance.toString(),
      }
    })
  const cashAccounts = rows.filter(
    (account) => account.purpose === "CASH" || account.purpose === "BANK",
  )
  const cashClosing = cashAccounts.reduce(
    (sum, account) => sum + BigInt(account.closingBalanceMinor),
    BigInt(0),
  )
  const cashMovement = cashAccounts.reduce(
    (sum, account) =>
      sum +
      BigInt(account.periodDebitMinor) -
      BigInt(account.periodCreditMinor),
    BigInt(0),
  )
  return {
    cashFlow: calculateCashFlow(
      cashGroups.map((group) => ({
        ...group,
        netMinor: BigInt(group.netMinor),
      })),
      cashClosing - cashMovement,
      cashClosing,
    ),
    bookId: book.id,
    currencyCode: book.currencyCode,
    bookkeepingStartsAt: book.startsAt,
    from: input.from,
    through: input.through,
    snapshotSequence: snapshot.toString(),
    coverage: "POSTED_FINANCE_ENTRIES" as const,
    completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
    coverageGaps: [
      "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
      "INVENTORY_COSTS",
      "OPENING_BALANCE_RECONCILIATION",
    ] as const,
    balanceSheet: calculateFinancialPosition(rows),
    trialBalance: {
      accounts: rows,
      debitMinor: totalDebit.toString(),
      creditMinor: totalCredit.toString(),
      differenceMinor: (totalDebit - totalCredit).toString(),
      balanced: totalDebit === totalCredit,
    },
    profitAndLoss: {
      accounts: profitAndLossAccounts,
      revenueMinor: revenue.toString(),
      costOfSalesMinor: costOfSales.toString(),
      grossProfitMinor: (revenue - costOfSales).toString(),
      expensesMinor: expenses.toString(),
      netProfitMinor: (revenue - costOfSales - expenses).toString(),
    },
  }
}
