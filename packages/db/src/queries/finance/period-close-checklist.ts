import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { getFinanceReportsInTransaction } from "./reports"
import { FinanceError } from "./rules"

type CheckStatus = "PASS" | "BLOCKED" | "REVIEW_REQUIRED"
type CloseCheck = {
  id: string
  label: string
  status: CheckStatus
  explanation: string
  accountIds: string[]
}

const REVIEW_ACCOUNT_LIMIT = 200
const REVIEW_COUNT_LIMIT = 200

/** Date locking and complete operational reconciliation are distinct decisions. */
export async function getFinancePeriodCloseChecklist(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; through: Date },
) {
  if (
    !Number.isFinite(input.through.getTime()) ||
    input.through.toISOString().slice(11) !== "23:59:59.999Z" ||
    input.through >= new Date()
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a completed UTC day for the closing checklist.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: {
          id: true,
          currencyCode: true,
          startsAt: true,
          closedThrough: true,
          lastSequence: true,
        },
      })
      if (!book || book.id !== input.bookId)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const from = book.closedThrough
        ? new Date(book.closedThrough.getTime() + 1)
        : book.startsAt
      if (input.through < from)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The checklist must cover the next open period in this book.",
        )
      const accountCount = await tx.financeAccount.count({
        where: { bookId: book.id },
      })
      if (accountCount > REVIEW_ACCOUNT_LIMIT)
        throw new FinanceError(
          "CONFLICT",
          "This book exceeds the bounded closing review. No complete checklist is certified.",
        )
      const [report, existing, counts] = await Promise.all([
        getFinanceReportsInTransaction(tx, {
          ...input,
          from,
          snapshotSequence: book.lastSequence.toString(),
        }),
        tx.financePeriod.findUnique({
          where: { bookId_startsAt: { bookId: book.id, startsAt: from } },
          select: { id: true, endsAt: true, reopenedAt: true },
        }),
        tx.financeReconciliation.findMany({
          where: {
            bookId: book.id,
            asOf: input.through,
            snapshotSequence: { lte: book.lastSequence },
            account: { purpose: "CASH" },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: REVIEW_COUNT_LIMIT + 1,
          select: {
            id: true,
            bookId: true,
            accountId: true,
            asOf: true,
            snapshotSequence: true,
            observedBalanceMinor: true,
          },
        }),
      ])
      if (
        report.bookId !== book.id ||
        report.currencyCode !== book.currencyCode ||
        report.snapshotSequence !== book.lastSequence.toString() ||
        report.from.getTime() !== from.getTime() ||
        report.through.getTime() !== input.through.getTime() ||
        report.trialBalance.accounts.length !== accountCount
      )
        throw new FinanceError("CONFLICT", "Closing report scope changed.")
      const accounts = report.trialBalance.accounts
      const accountIds = new Set(accounts.map((row) => row.accountId))
      const cashAccounts = accounts.filter((row) => row.purpose === "CASH")
      const cashAccountIds = new Set(cashAccounts.map((row) => row.accountId))
      if (accountIds.size !== accounts.length)
        throw new FinanceError("CONFLICT", "Closing accounts are repeated.")
      const countCoverageComplete = counts.length <= REVIEW_COUNT_LIMIT
      const latestCount = new Map<string, (typeof counts)[number]>()
      for (const count of counts) {
        if (
          count.bookId !== book.id ||
          !cashAccountIds.has(count.accountId) ||
          count.asOf.getTime() !== input.through.getTime() ||
          count.snapshotSequence < 0n ||
          count.snapshotSequence > book.lastSequence ||
          count.observedBalanceMinor < 0n
        )
          throw new FinanceError("CONFLICT", "Cash review source changed.")
        if (!latestCount.has(count.accountId))
          latestCount.set(count.accountId, count)
      }
      const cash = cashAccounts.map((account) => {
        const count = countCoverageComplete
          ? latestCount.get(account.accountId)
          : undefined
        return {
          accountId: account.accountId,
          name: account.name,
          closingBalanceMinor: account.closingBalanceMinor,
          countId: count?.id ?? null,
          observedBalanceMinor: count?.observedBalanceMinor.toString() ?? null,
          status: !count
            ? ("REVIEW_REQUIRED" as const)
            : count.observedBalanceMinor.toString() ===
                account.closingBalanceMinor
              ? ("PASS" as const)
              : ("BLOCKED" as const),
        }
      })
      const dateEligible =
        !existing ||
        (Boolean(existing.reopenedAt) &&
          existing.endsAt.getTime() === input.through.getTime())
      const checks: CloseCheck[] = [
        {
          id: "CONTIGUOUS_DATES",
          label: "Review the next open period",
          status: dateEligible ? "PASS" : "BLOCKED",
          explanation: dateEligible
            ? "This completed UTC cutoff follows the current date lock."
            : "Reclose the reopened period using its original end date.",
          accountIds: [],
        },
        {
          id: "POSTED_TRIAL_BALANCE",
          label: "Balance the posted journal",
          status: report.trialBalance.balanced ? "PASS" : "BLOCKED",
          explanation: `Posted debit ${report.trialBalance.debitMinor} and credit ${report.trialBalance.creditMinor} minor units at snapshot ${report.snapshotSequence}.`,
          accountIds: accounts.map((row) => row.accountId),
        },
        {
          id: "POSTED_POSITION_IDENTITY",
          label: "Check assets, liabilities and equity",
          status: report.balanceSheet.balanced ? "PASS" : "BLOCKED",
          explanation:
            "This identity covers posted entries, including unclosed earnings; it does not prove complete opening or source records.",
          accountIds: [],
        },
        {
          id: "CASH_RECONCILIATION",
          label: "Match cash counts at the cutoff",
          status: cash.some((row) => row.status === "BLOCKED")
            ? "BLOCKED"
            : !countCoverageComplete ||
                cash.some((row) => row.status !== "PASS")
              ? "REVIEW_REQUIRED"
              : "PASS",
          explanation: countCoverageComplete
            ? "The latest stored physical count at this exact cutoff is compared with each posted cash balance. Missing or different counts need review."
            : "More than 200 cutoff counts exist. This bounded response cannot certify complete cash-count coverage.",
          accountIds: cashAccounts.map((row) => row.accountId),
        },
        ...(
          [
            [
              "BANK_RECONCILIATION",
              "Review bank and clearing statements",
              ["BANK", "CLEARING"],
            ],
            [
              "CUSTOMER_RECONCILIATION",
              "Reconcile customers and held credit",
              ["RECEIVABLE", "CUSTOMER_ADVANCE"],
            ],
            [
              "SUPPLIER_RECONCILIATION",
              "Reconcile supplier bills and advances",
              ["PAYABLE", "SUPPLIER_ADVANCE"],
            ],
            [
              "INVENTORY_RECONCILIATION",
              "Review Inventory custody, costs and unknown history",
              ["INVENTORY", "COST_OF_SALES"],
            ],
          ] as const
        ).map(([id, label, purposes]) => ({
          id,
          label,
          status: "REVIEW_REQUIRED" as const,
          explanation:
            "Posted control balances alone do not prove complete source reconciliation. Review the underlying records and unresolved coverage.",
          accountIds: accounts
            .filter((row) =>
              purposes.some((purpose) => purpose === row.purpose),
            )
            .map((row) => row.accountId),
        })),
        {
          id: "OPENING_AND_ADJUSTMENTS",
          label: "Verify opening equity, assets, loans, accruals and taxes",
          status: "REVIEW_REQUIRED",
          explanation:
            "Complete opening evidence and remaining asset, loan, prepayment, accrual and tax sources are not certified by this checklist.",
          accountIds: [],
        },
        {
          id: "YEAR_END_EARNINGS",
          label: "Review year-end earnings separately",
          status: "REVIEW_REQUIRED",
          explanation:
            "Date locking does not transfer earnings. The year-end retained-earnings workflow remains separate.",
          accountIds: [],
        },
      ]
      return {
        bookId: book.id,
        currencyCode: book.currencyCode,
        from,
        through: input.through,
        closedThrough: book.closedThrough,
        snapshotSequence: report.snapshotSequence,
        coverage: report.coverage,
        completeness: report.completeness,
        coverageGaps: report.coverageGaps,
        dateLockEligible: dateEligible && report.trialBalance.balanced,
        operationallyReconciled: false as const,
        checks,
        cash,
        cashCountCoverageComplete: countCoverageComplete,
        cashCountReviewLimit: REVIEW_COUNT_LIMIT,
        trialBalance: report.trialBalance,
        balanceSheet: report.balanceSheet,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
