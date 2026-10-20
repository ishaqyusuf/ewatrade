"use client"
import { DateRangeControl } from "@/components/date-range-control"
import { FormFeedback } from "@/components/forms/form-feedback"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportSection,
  ReportSectionSkeleton,
} from "@/components/reports/report-section"
import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import { useFinanceRangeParams } from "@/hooks/use-finance-range-params"
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
import { useMemo, useState } from "react"
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
        <h2 className="font-medium">Not your full profit yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These reports include only entries posted in Finance. Sales, Customer,
          stock and opening records may be incomplete, so the totals aren't your
          full profit.
        </p>
      </div>
      <div className="grid gap-2">
        <DateRangeControl
          label="Report date range"
          start={from}
          end={through}
          min={start}
          onApply={(range) => {
            void setRange(range).then(() => setRevision((value) => value + 1))
          }}
        />
        <p className="text-xs text-muted-foreground">
          Days run midnight to midnight UTC (1 am in Lagos).
        </p>
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
    return <ReportSectionSkeleton count={4} title="Reports" />
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
        <h2 className="font-medium">Totals for these dates</h2>
        <FinanceReportExport report={report} />
      </div>
      <p className="text-xs text-muted-foreground">
        {from} to {through} · {book.currencyCode}
      </p>
      <ReportSection title="Profit and loss" description="Did you make money?">
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
        <p className="text-sm text-muted-foreground">
          Money still on its way isn't counted. Moves between your own accounts
          cancel out; moves to or from money on its way show separately.
          Expenses the owner paid from their own pocket don't change business
          money.
        </p>
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
      <ReportSection title={<>What you own and owe on {through}</>}>
        <p className="text-sm text-muted-foreground">
          What you own, what you owe and the owner's money add up everything
          recorded up to this date. Profit not yet closed counts all income and
          expenses up to this date, whatever start date you picked for the
          profit report.
        </p>
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
        title={
          <>
            Account totals for your accountant (trial balance) as of {through}
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Everything recorded from your start date up to this date. When the two
          sides match, your records add up. That doesn't mean nothing is
          missing.
        </p>
        {!report.trialBalance.balanced ? (
          <FormFeedback appearance="dashboard">
            Your records don't add up by{" "}
            {money(report.trialBalance.differenceMinor)}. Fix this before
            relying on these reports.
          </FormFeedback>
        ) : null}
        <TrialBalanceTable report={report} money={money} />
      </ReportSection>
    </div>
  )
}

type FinanceReport = RouterOutputs["finance"]["reports"]

/** Account rows are selectable; the Total footer remains a report summary. */
function TrialBalanceTable({
  report,
  money,
}: {
  report: FinanceReport
  money: (value: string) => string
}) {
  const accountIds = useMemo(
    () => report.trialBalance.accounts.map((account) => account.accountId),
    [report.trialBalance.accounts],
  )
  const selection = useInlineSelection({
    ids: accountIds,
    scope: `${report.snapshotSequence}:${report.through}`,
  })
  return (
    <>
      <InlineSelectionStatus
        selection={selection}
        note="The CSV export includes every account"
      />
      <section
        className="overflow-x-auto"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
        tabIndex={0}
        aria-label="Account totals table"
      >
        <Table className="w-full min-w-[600px] text-sm">
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead scope="col" className="w-10 p-3">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all accounts"
                />
              </TableHead>
              <TableHead scope="col" className="p-3 text-left">
                Account
              </TableHead>
              <TableHead scope="col" className="p-3 text-right">
                Debit (money in or owned)
              </TableHead>
              <TableHead scope="col" className="p-3 text-right">
                Credit (money out or owed)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.trialBalance.accounts.map((account) => (
              <TableRow
                key={account.accountId}
                className="border-b border-border"
                data-state={
                  selection.isSelected(account.accountId)
                    ? "selected"
                    : undefined
                }
              >
                <TableCell className="p-3">
                  <InlineRowCheckbox
                    selection={selection}
                    id={account.accountId}
                    label={`Select ${account.code} ${account.name}`}
                  />
                </TableCell>
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
              <TableCell className="p-3" />
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
    </>
  )
}
