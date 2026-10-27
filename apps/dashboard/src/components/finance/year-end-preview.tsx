"use client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
import { formatFinanceDate } from "./format-date"
import {
  type FinanceYearEndAccountRow,
  type FinanceYearEndPreview,
  financeYearEndAccountRows,
  financeYearEndBlockers,
  financeYearEndEntries,
  financeYearEndGapLabel,
} from "./year-end-state"

/** Read-only year-end preview: what would move, and why it can't close yet. */
export function FinanceYearEndPreviewView({
  preview,
}: {
  preview: FinanceYearEndPreview
}) {
  const money = (value: string) =>
    formatFinanceMoney(value, preview.currencyCode)
  const rows = financeYearEndAccountRows(preview)
  const blockers = financeYearEndBlockers(preview, formatFinanceDate)
  const loss = BigInt(preview.earningsMinor) < BigInt(0)
  const period = `${formatFinanceDate(preview.fiscalStart)} – ${formatFinanceDate(preview.fiscalEnd)}`
  const label = `${loss ? "Loss" : "Profit"} for the year${preview.cutoffCompleted ? "" : " so far"}`
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {period}
          {preview.cutoffCompleted ? "" : " · so far"}
          {preview.firstPeriodStub ? " · first year" : ""}
        </p>
        <Badge variant="destructive">Can&apos;t close yet</Badge>
      </div>

      {rows.hasActivity ? (
        <section className="grid gap-4 border border-border p-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {money(preview.earningsMinor)}
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="grid gap-0.5 border border-border px-3 py-2 tabular-nums">
              <span>
                Earned <b>{money(rows.earnedMinor)}</b>
              </span>
              <span>
                Costs <b>{money(rows.costsMinor)}</b>
              </span>
            </div>
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            <div className="grid gap-0.5 border border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {loss ? "Comes out of owner's money" : "Moves to owner's money"}
              </span>
              <span className="font-medium">{rows.retained.name}</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid justify-items-center gap-1 border border-dashed border-border p-8 text-center">
          <p className="font-medium">No profit or loss to move</p>
          <p className="text-sm text-muted-foreground">
            Nothing is recorded in Finance between {period}.
          </p>
        </section>
      )}

      <Alert variant="destructive" appearance="dashboard">
        <AlertTitle>You can&apos;t close the year yet</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 grid gap-2">
            {blockers.map((blocker) => (
              <li key={blocker.id} className="grid gap-0.5">
                <span className="font-medium text-foreground">
                  {blocker.title}
                </span>
                <span>{blocker.detail}</span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {rows.hasActivity ? (
        <section className="grid gap-3">
          <h4 className="text-sm font-medium">
            What year end does to each account
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Now</TableHead>
                <TableHead className="text-right">After year end</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AccountGroup
                title="Money earned"
                rows={rows.income}
                money={money}
              />
              <AccountGroup
                title="Costs and expenses"
                rows={rows.expenses}
                money={money}
              />
              <AccountGroup
                title="Owner's money"
                rows={[rows.retained]}
                money={money}
              />
            </TableBody>
          </Table>
          <Disclosure title="Show the entries">
            <Entries preview={preview} money={money} />
          </Disclosure>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h4 className="text-sm font-medium">
          What this doesn&apos;t cover yet
        </h4>
        <ul className="grid gap-2 text-sm">
          {preview.coverageGaps.map((gap) => {
            const [title, detail] = financeYearEndGapLabel(gap)
            return (
              <li key={gap} className="grid gap-0.5">
                <span className="font-medium">{title}</span>
                {detail ? (
                  <span className="text-muted-foreground">{detail}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        {preview.closedThrough
          ? `Months are closed up to ${formatFinanceDate(preview.closedThrough)}. `
          : ""}
        Closing a month doesn&apos;t close the year. This preview only uses
        entries posted in Finance.
      </p>
    </div>
  )
}

function AccountGroup({
  title,
  rows,
  money,
}: {
  title: string
  rows: FinanceYearEndAccountRow[]
  money: (value: string) => string
}) {
  if (!rows.length) return null
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={3} className="pt-4 text-xs text-muted-foreground">
          {title}
        </TableCell>
      </TableRow>
      {rows.map((row) => (
        <TableRow key={row.accountId}>
          <TableCell>
            {row.name}{" "}
            <span className="text-xs text-muted-foreground">{row.code}</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {money(row.nowMinor)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {money(row.afterMinor)}
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

function Entries({
  preview,
  money,
}: {
  preview: FinanceYearEndPreview
  money: (value: string) => string
}) {
  const journals = financeYearEndEntries(preview)
  return (
    <div className="mt-3 grid gap-4">
      {journals.map((lines, index) => {
        const total = lines
          .reduce(
            (sum, line) => sum + BigInt(line.debitMinor ?? "0"),
            BigInt(0),
          )
          .toString()
        return (
          <Table key={lines[0]?.key ?? index}>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {journals.length > 1
                    ? `Entry ${index + 1} of ${journals.length}`
                    : "Account"}
                </TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>{line.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.debitMinor ? money(line.debitMinor) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.creditMinor ? money(line.creditMinor) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )
      })}
    </div>
  )
}
