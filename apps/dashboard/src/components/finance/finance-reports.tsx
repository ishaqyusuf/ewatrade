"use client"
import { DateRangeControl } from "@/components/date-range-control"
import { FormFeedback } from "@/components/forms/form-feedback"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportSection,
  ReportSectionSkeleton,
} from "@/components/reports/report-section"
import { useFinanceRangeParams } from "@/hooks/use-finance-range-params"
import { useTRPC } from "@/trpc/client"
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
import { useState } from "react"
import { FinancePeriodHistory } from "./period-history"
import {
  FinanceReportAccountLedger,
  ReportAccountLink,
} from "./report-account-ledger"
import { FinanceReportExport } from "./report-export"
import type { FinanceBook } from "./types"

export function FinanceReports({ book }: { book: FinanceBook }) {
  const start = new Date(book.startsAt).toISOString().slice(0, 10)
  const { from, through, setRange } = useFinanceRangeParams({ minimum: start })
  const [revision, setRevision] = useState(0)
  return (
    <section className="grid gap-6">
      <div className="border border-border bg-background p-6">
        <h2 className="font-medium">Partial financial records</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These reports include posted finance entries only. Sales, customer
          payments and inventory costs are not yet connected, and opening
          balances need reconciliation. The totals do not represent your
          complete business profit or financial position.
        </p>
      </div>
      <div>
        <DateRangeControl
          label="Financial report date range (UTC)"
          start={from}
          end={through}
          min={start}
          onApply={(range) => {
            void setRange(range).then(() => setRevision((value) => value + 1))
          }}
        />
      </div>
      <FinancePeriodHistory book={book} />
      <FinanceReportAccountLedger book={book} />
      <ReportResults
        key={`${book.id}:${from}:${through}:${revision}`}
        book={book}
        from={from}
        through={through}
      />
    </section>
  )
}

function ReportResults({
  book,
  from,
  through,
}: { book: FinanceBook; from: string; through: string }) {
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
  if (query.isPending)
    return <ReportSectionSkeleton count={4} title="Financial reports" />
  if (query.isError)
    return (
      <ReportError error={query.error} retry={() => void query.refetch()} />
    )
  const report = query.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const profit = report.profitAndLoss
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h2 className="font-medium">Recorded financial reports</h2>
        <FinanceReportExport report={report} />
      </div>
      <p className="text-xs text-muted-foreground">
        {from} to {through} UTC · Snapshot {report.snapshotSequence} ·{" "}
        {book.currencyCode}
      </p>
      <ReportSection title={<>Profit and loss — recorded entries</>}>
        <dl className="grid gap-3">
          {[
            { label: "Revenue", amount: profit.revenueMinor },
            { label: "Cost of sales", amount: profit.costOfSalesMinor },
            { label: "Gross profit", amount: profit.grossProfitMinor },
            { label: "Other expenses", amount: profit.expensesMinor },
            { label: "Net profit / loss", amount: profit.netProfitMinor },
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
        <Disclosure title={<>View income and expense accounts</>}>
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
      <ReportSection title={<>Cash flow — recorded cash and bank entries</>}>
        <p className="text-sm text-muted-foreground">
          Clearing balances awaiting settlement are excluded. Transfers between
          included accounts cancel out; transfers to or from clearing appear
          separately. Owner-paid bills do not move business cash.
        </p>
        <dl className="grid gap-3">
          {[
            {
              label: "Opening cash and bank",
              amount: report.cashFlow.openingMinor,
            },
            {
              label: "Operating cash movement",
              amount: report.cashFlow.operatingMinor,
            },
            {
              label: "Owner financing movement",
              amount: report.cashFlow.financingMinor,
            },
            {
              label: "Transfers and clearing movement",
              amount: report.cashFlow.transfersAndClearingMinor,
            },
            {
              label: "Opening balance imports",
              amount: report.cashFlow.openingAdjustmentsMinor,
            },
            {
              label: "Unclassified movement",
              amount: report.cashFlow.unclassifiedMinor,
            },
            { label: "Net change", amount: report.cashFlow.netChangeMinor },
            {
              label: "Closing cash and bank",
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
            Some cash entries need classification. Review them before relying on
            category totals.
          </FormFeedback>
        ) : null}
        {!report.cashFlow.reconciled ? (
          <FormFeedback appearance="dashboard">
            Cash reconciliation difference:{" "}
            {money(report.cashFlow.differenceMinor)}
          </FormFeedback>
        ) : null}
      </ReportSection>
      <ReportSection
        title={<>Balance sheet — recorded entries as of {through}</>}
      >
        <p className="text-sm text-muted-foreground">
          Assets, liabilities and equity include cumulative posted balances.
          Unclosed earnings include all income and expenses through this date,
          independent of the selected profit-and-loss start date.
        </p>
        {[
          {
            title: "Assets",
            accounts: report.balanceSheet.assets,
            total: report.balanceSheet.assetsMinor,
          },
          {
            title: "Liabilities",
            accounts: report.balanceSheet.liabilities,
            total: report.balanceSheet.liabilitiesMinor,
          },
          {
            title: "Posted equity",
            accounts: report.balanceSheet.equity,
            total: report.balanceSheet.postedEquityMinor,
          },
        ].map((group) => (
          <Disclosure
            key={group.title}
            title={
              <>
                {group.title}· {money(group.total)}
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
            <dt>Unclosed earnings</dt>
            <dd className="tabular-nums">
              {money(report.balanceSheet.unclosedEarningsMinor)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Total equity including earnings</dt>
            <dd className="tabular-nums">
              {money(report.balanceSheet.totalEquityMinor)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
            <dt>Liabilities and equity</dt>
            <dd className="tabular-nums">
              {money(report.balanceSheet.liabilitiesAndEquityMinor)}
            </dd>
          </div>
        </dl>
        {!report.balanceSheet.balanced ? (
          <FormFeedback appearance="dashboard">
            Balance-sheet difference:{" "}
            {money(report.balanceSheet.differenceMinor)}. Resolve the journal
            imbalance before relying on this report.
          </FormFeedback>
        ) : null}
      </ReportSection>
      <ReportSection title={<>Trial balance as of {through}</>}>
        <p className="text-sm text-muted-foreground">
          Includes all recorded activity from bookkeeping start through this
          date. Equal debits and credits confirm journal balance; they do not
          confirm complete records.
        </p>
        {!report.trialBalance.balanced ? (
          <FormFeedback appearance="dashboard">
            Journal imbalance: {money(report.trialBalance.differenceMinor)}.
            Resolve this before relying on reports.
          </FormFeedback>
        ) : null}
        <section
          className="overflow-x-auto"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
          tabIndex={0}
          aria-label="Trial balance table"
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
      </ReportSection>
    </div>
  )
}
