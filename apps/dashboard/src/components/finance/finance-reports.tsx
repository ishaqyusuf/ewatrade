"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { ReportDateControl } from "@/components/reports/report-date-control"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
import { ReportSection } from "@/components/reports/report-section"
import { useFinanceRangeParams } from "@/hooks/use-finance-range-params"
import type { ReportRange } from "@/lib/report-range"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Disclosure,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { formatFinanceDate } from "./format-date"
import { FinancePeriodHistory } from "./period-history"
import {
  FinanceReportAccountLedger,
  ReportAccountLink,
} from "./report-account-ledger"
import { FinanceReportExport } from "./report-export"
import type { FinanceBook } from "./types"
import { FinanceYearEnd } from "./year-end-section"

const DAY_MS = 86_400_000

/** Inclusive Finance dates as a Reports period (exclusive end) and back. */
function financeRange(from: string, through: string): ReportRange {
  return {
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(new Date(`${through}T00:00:00.000Z`).getTime() + DAY_MS),
  }
}

export function FinanceReports({ book }: { book: FinanceBook }) {
  const start = new Date(book.startsAt).toISOString().slice(0, 10)
  const { from, through, setRange } = useFinanceRangeParams({ minimum: start })
  const [revision, setRevision] = useState(0)
  return (
    <section className="grid min-w-0 gap-5">
      <ReportResults
        key={`${book.id}:${from}:${through}:${revision}`}
        book={book}
        from={from}
        through={through}
        period={
          <ReportDateControl
            range={financeRange(from, through)}
            onChange={(range) => {
              // Nothing before the book starts; the last day is inclusive here.
              const first = range.from.toISOString().slice(0, 10)
              const last = new Date(range.to.getTime() - DAY_MS)
                .toISOString()
                .slice(0, 10)
              void setRange({
                start: first < start ? start : first,
                end: last < start ? start : last,
              }).then(() => setRevision((value) => value + 1))
            }}
          />
        }
      />
      <FinanceReportAccountLedger book={book} />
      <FinancePeriodHistory book={book} />
      <FinanceYearEnd book={book} />
    </section>
  )
}

function ReportResults({
  book,
  from,
  through,
  period,
}: {
  book: FinanceBook
  from: string
  through: string
  period: ReactNode
}) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.reports.queryOptions(
      {
        bookId: book.id,
        from: new Date(`${from}T00:00:00.000Z`),
        through: new Date(`${through}T23:59:59.999Z`),
      },
      { staleTime: 0, refetchOnWindowFocus: false },
    ),
  )
  const toolbar = (actions: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {period}
      {actions}
    </div>
  )
  if (query.isPending)
    return (
      <>
        {toolbar(null)}
        <ReportHeadlineStripSkeleton count={4} />
      </>
    )
  if (query.isError)
    return (
      <>
        {toolbar(null)}
        <ReportError error={query.error} retry={() => void query.refetch()} />
      </>
    )
  const report = query.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const profit = report.profitAndLoss
  const orders = report.orderCollections
  const negative = (value: string) => value.startsWith("-")
  return (
    <div className="grid min-w-0 gap-5">
      {toolbar(<FinanceReportExport report={report} />)}
      <ReportHeadlineStrip
        label="Totals for these dates"
        items={[
          {
            label: "Sales",
            money: true,
            muted: profit.revenueMinor === "0",
            value: money(profit.revenueMinor),
          },
          {
            label: "Expenses",
            money: true,
            muted: profit.expensesMinor === "0",
            value: money(profit.expensesMinor),
          },
          {
            label: "Profit",
            money: true,
            muted: profit.netProfitMinor === "0",
            value: (
              <span
                className={
                  negative(profit.netProfitMinor) ? "text-destructive" : ""
                }
              >
                {money(profit.netProfitMinor)}
              </span>
            ),
          },
          {
            label: "Money at the end",
            money: true,
            value: money(report.cashFlow.closingMinor),
          },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        Counts only what's recorded in Finance, so it may not be your full
        profit.
      </p>
      <ReportSection title="Profit and loss">
        <dl className="grid gap-3">
          {[
            { label: "Sales", amount: profit.revenueMinor },
            { label: "Cost of what you sold", amount: profit.costOfSalesMinor },
            {
              label: "Profit before expenses",
              amount: profit.grossProfitMinor,
            },
            { label: "Expenses", amount: profit.expensesMinor },
            { label: "Profit", amount: profit.netProfitMinor },
          ].map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-border pb-3"
            >
              <dt>{row.label}</dt>
              <dd className="font-medium tabular-nums">{money(row.amount)}</dd>
            </div>
          ))}
        </dl>
        {orders && orders.receivedMinor !== "0" ? (
          <p className="text-sm text-muted-foreground">
            {money(orders.receivedMinor)} received from Orders in these dates
            isn't counted as Sales yet. It's held under{" "}
            <ReportAccountLink
              accountId={orders.accountId}
              label="Order collections awaiting reconciliation"
              from={report.from}
              through={report.through}
              snapshot={report.snapshotSequence}
            />
            .
          </p>
        ) : null}
        <Disclosure title={<>Show the accounts behind this</>}>
          <dl className="mt-3 grid gap-3">
            {profit.accounts.map((account) => (
              <div
                key={account.accountId}
                className="flex justify-between gap-4 text-sm"
              >
                <dt>
                  <ReportAccountLink
                    accountId={account.accountId}
                    label={`${account.code} · ${account.name}`}
                    from={report.from}
                    through={report.through}
                    snapshot={report.snapshotSequence}
                  />
                </dt>
                <dd className="tabular-nums">
                  {money(account.periodBalanceMinor)}
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </ReportSection>
      <ReportSection title="Money in and out">
        <dl className="grid gap-3">
          {[
            {
              label: "Money at the start",
              amount: report.cashFlow.openingMinor,
            },
            {
              label: "From running the business",
              amount: report.cashFlow.operatingMinor,
            },
            {
              label: "Owner put in or took out",
              amount: report.cashFlow.financingMinor,
            },
            {
              label: "Moved between accounts",
              amount: report.cashFlow.transfersAndClearingMinor,
            },
            {
              label: "Starting balances added",
              amount: report.cashFlow.openingAdjustmentsMinor,
            },
            {
              label: "Not sorted yet",
              amount: report.cashFlow.unclassifiedMinor,
            },
            { label: "Change", amount: report.cashFlow.netChangeMinor },
            {
              label: "Money at the end",
              amount: report.cashFlow.closingMinor,
            },
          ].map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-border pb-3"
            >
              <dt>{row.label}</dt>
              <dd className="font-medium tabular-nums">{money(row.amount)}</dd>
            </div>
          ))}
        </dl>
        {!report.cashFlow.classificationComplete ? (
          <FormFeedback appearance="dashboard">
            Some money isn't sorted yet. Sort it before relying on the totals
            above.
          </FormFeedback>
        ) : null}
        {!report.cashFlow.reconciled ? (
          <FormFeedback appearance="dashboard">
            Money at the end is off by {money(report.cashFlow.differenceMinor)}
          </FormFeedback>
        ) : null}
      </ReportSection>
      <ReportSection
        title={<>What you own and owe on {formatFinanceDate(report.through)}</>}
      >
        {[
          {
            title: "What you own",
            accounts: report.balanceSheet.assets,
            total: report.balanceSheet.assetsMinor,
          },
          {
            title: "What you owe",
            accounts: report.balanceSheet.liabilities,
            total: report.balanceSheet.liabilitiesMinor,
          },
          {
            title: "Owner's money",
            accounts: report.balanceSheet.equity,
            total: report.balanceSheet.postedEquityMinor,
          },
        ].map((group) => (
          <Disclosure
            key={group.title}
            title={
              <>
                {group.title} · {money(group.total)}
              </>
            }
          >
            <dl className="mt-3 grid gap-3">
              {group.accounts.map((account) => (
                <div
                  key={account.accountId}
                  className="flex justify-between gap-4 text-sm"
                >
                  <dt>
                    <ReportAccountLink
                      accountId={account.accountId}
                      label={`${account.code} · ${account.name}`}
                      from={report.bookkeepingStartsAt}
                      through={report.through}
                      snapshot={report.snapshotSequence}
                    />
                  </dt>
                  <dd className="tabular-nums">
                    {money(account.closingBalanceMinor)}
                  </dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        ))}
        <dl className="grid gap-3">
          <div className="flex justify-between gap-4">
            <dt>Profit not yet closed</dt>
            <dd className="tabular-nums">
              {money(report.balanceSheet.unclosedEarningsMinor)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Owner's money including profit</dt>
            <dd className="tabular-nums">
              {money(report.balanceSheet.totalEquityMinor)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
            <dt>What you owe plus owner's money</dt>
            <dd className="tabular-nums">
              {money(report.balanceSheet.liabilitiesAndEquityMinor)}
            </dd>
          </div>
        </dl>
        {!report.balanceSheet.balanced ? (
          <FormFeedback appearance="dashboard">
            What you own and what you owe plus owner's money differ by{" "}
            {money(report.balanceSheet.differenceMinor)}. Fix this before
            relying on this report.
          </FormFeedback>
        ) : null}
      </ReportSection>
      <ReportSection
        title={<>Account totals on {formatFinanceDate(report.through)}</>}
      >
        {!report.trialBalance.balanced ? (
          <FormFeedback appearance="dashboard">
            Your records don't add up by{" "}
            {money(report.trialBalance.differenceMinor)}. Fix this before
            relying on these reports.
          </FormFeedback>
        ) : null}
        <Disclosure title={<>For your accountant (trial balance)</>}>
          <TrialBalanceTable report={report} money={money} />
        </Disclosure>
      </ReportSection>
    </div>
  )
}

type FinanceReport = RouterOutputs["finance"]["reports"]

/** Every account's closing debit and credit, with the total. */
function TrialBalanceTable({
  report,
  money,
}: {
  report: FinanceReport
  money: (value: string) => string
}) {
  return (
    <section
      className="mt-3 overflow-x-auto"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
      tabIndex={0}
      aria-label="Account totals table"
    >
      <Table className="w-full min-w-[560px] text-sm">
        <TableHeader>
          <TableRow className="border-b border-border">
            <TableHead scope="col" className="p-3 text-left">
              Account
            </TableHead>
            <TableHead scope="col" className="p-3 text-right">
              Debit
            </TableHead>
            <TableHead scope="col" className="p-3 text-right">
              Credit
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.trialBalance.accounts.map((account) => (
            <TableRow
              key={account.accountId}
              className="border-b border-border"
            >
              <TableCell className="p-3">
                <ReportAccountLink
                  accountId={account.accountId}
                  label={`${account.code} · ${account.name}`}
                  from={report.bookkeepingStartsAt}
                  through={report.through}
                  snapshot={report.snapshotSequence}
                />
              </TableCell>
              <TableCell className="p-3 text-right tabular-nums">
                {money(account.closingDebitMinor)}
              </TableCell>
              <TableCell className="p-3 text-right tabular-nums">
                {money(account.closingCreditMinor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-muted text-foreground">
          <TableRow className="font-medium">
            <TableHead scope="row" className="p-3 text-left">
              Total
            </TableHead>
            <TableCell className="p-3 text-right tabular-nums">
              {money(report.trialBalance.debitMinor)}
            </TableCell>
            <TableCell className="p-3 text-right tabular-nums">
              {money(report.trialBalance.creditMinor)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  )
}
