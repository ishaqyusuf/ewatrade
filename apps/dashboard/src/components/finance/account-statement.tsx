"use client"

import { DateRangeControl } from "@/components/date-range-control"
import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useFinanceRangeParams } from "@/hooks/use-finance-range-params"
import { useTRPC } from "@/trpc/client"
import {
  Button,
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
import { useEffect, useMemo, useState } from "react"
import { FinanceStatementExport } from "./statement-export"
import type { FinanceBook } from "./types"

export function FinanceAccountStatement({
  book,
  accountId,
}: {
  book: FinanceBook
  accountId: string
}) {
  const start = new Date(book.startsAt).toISOString().slice(0, 10)
  const { from, through, setRange } = useFinanceRangeParams({
    minimum: start,
    statement: true,
  })
  const [version, setVersion] = useState(0)
  return (
    <section className="grid gap-5 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Account statement</h2>
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setVersion((value) => value + 1)}
        >
          Refresh statement
        </Button>
      </div>
      <div>
        <DateRangeControl
          label="Account statement date range (UTC)"
          start={from}
          end={through}
          min={start}
          onApply={(range) => {
            void setRange(range).then(() => setVersion((value) => value + 1))
          }}
        />
      </div>
      <StatementPages
        key={`${book.id}:${accountId}:${from}:${through}:${version}`}
        book={book}
        accountId={accountId}
        from={from}
        through={through}
      />
    </section>
  )
}

function StatementPages({
  book,
  accountId,
  from,
  through,
}: {
  book: FinanceBook
  accountId: string
  from: string
  through: string
}) {
  const trpc = useTRPC()
  const { setParams } = useFinanceParams()
  const [snapshot, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined])
  const query = useQuery(
    trpc.finance.accountActivity.queryOptions(
      {
        bookId: book.id,
        accountId,
        from: new Date(`${from}T00:00:00.000Z`),
        through: new Date(`${through}T23:59:59.999Z`),
        snapshotSequence: snapshot,
        cursor: cursors.at(-1),
        limit: 30,
      },
      {
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  useEffect(() => {
    if (snapshot === undefined && query.data && !query.isFetching)
      setSnapshot(query.data.snapshotSequence)
  }, [query.data, query.isFetching, snapshot])
  // Entry rows only; opening/closing figures stay statement summaries.
  const entryIds = useMemo(
    () => query.data?.items.map((entry) => entry.id) ?? [],
    [query.data],
  )
  const selection = useInlineSelection({
    ids: entryIds,
    scope: String(cursors.at(-1) ?? ""),
    disabled: query.isFetching,
  })
  if (query.isPending) return <output>Loading statement…</output>
  if (query.isError)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button appearance="form" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const statement = query.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{statement.account.name}</h3>
        <FinanceStatementExport
          key={statement.snapshotSequence}
          bookId={book.id}
          statement={statement}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Recorded finance entries only. Sales and customer payments that have not
        been posted are excluded. Refresh to include newer entries.
      </p>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Opening balance", statement.openingBalanceMinor],
          ["Money in", statement.debitMinor],
          ["Money out", statement.creditMinor],
          ["Closing balance", statement.closingBalanceMinor],
        ].map(([label, amount]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{money(amount ?? "0")}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Page {cursors.length} · Page opening{" "}
        {money(statement.pageOpeningBalanceMinor)} · Snapshot{" "}
        {statement.snapshotSequence}
      </p>
      <InlineSelectionStatus
        selection={selection}
        note="Export full statement includes every entry"
      />
      <section
        className="overflow-x-auto border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the wide statement.
        tabIndex={0}
        aria-label="Account statement entries"
      >
        <Table className="w-full min-w-[720px] text-sm">
          <TableHeader>
            <TableRow className="border-b border-border text-left">
              <TableHead scope="col" className="w-10 p-3">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all loaded statement entries"
                />
              </TableHead>
              <TableHead scope="col" className="p-3">
                Date (UTC)
              </TableHead>
              <TableHead scope="col" className="p-3">
                Description
              </TableHead>
              <TableHead scope="col" className="p-3 text-right">
                Money in
              </TableHead>
              <TableHead scope="col" className="p-3 text-right">
                Money out
              </TableHead>
              <TableHead scope="col" className="p-3 text-right">
                Balance
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.items.length ? (
              statement.items.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="border-b border-border last:border-0"
                  data-state={
                    selection.isSelected(entry.id) ? "selected" : undefined
                  }
                >
                  <TableCell className="p-3 align-top">
                    <InlineRowCheckbox
                      selection={selection}
                      id={entry.id}
                      label={`Select entry ${entry.description}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 align-top">
                    {new Date(entry.effectiveAt).toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="max-w-sm p-3">
                    <p className="break-words">{entry.description}</p>
                    {entry.reversalOfId ? (
                      <p className="text-xs text-muted-foreground">
                        Correction entry
                      </p>
                    ) : entry.reversedById ? (
                      <p className="text-xs text-muted-foreground">
                        Reversed; original retained
                      </p>
                    ) : null}
                    {entry.sourceKind === "EXPENSE_BILL" ? (
                      <Button
                        appearance="form"
                        variant="ghost"
                        onClick={() =>
                          void setParams({
                            financeSheet: "bill",
                            billId: entry.sourceId,
                          })
                        }
                      >
                        View expense
                      </Button>
                    ) : null}
                    {[
                      "TRANSFER",
                      "OWNER_CONTRIBUTION",
                      "OWNER_WITHDRAWAL",
                    ].includes(entry.sourceKind) &&
                    !entry.reversalOfId &&
                    !entry.reversedById ? (
                      <Button
                        appearance="form"
                        variant="ghost"
                        aria-label={`Reverse movement ${entry.description}`}
                        onClick={() =>
                          void setParams({
                            financeSheet: "money-reversal",
                            moneyEntryId: entry.id,
                          })
                        }
                      >
                        Reverse movement
                      </Button>
                    ) : null}
                  </TableCell>
                  <TableCell className="p-3 text-right align-top tabular-nums">
                    {money(entry.debitMinor)}
                  </TableCell>
                  <TableCell className="p-3 text-right align-top tabular-nums">
                    {money(entry.creditMinor)}
                  </TableCell>
                  <TableCell className="p-3 text-right align-top tabular-nums">
                    {money(entry.balanceMinor)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="p-6 text-center text-muted-foreground"
                >
                  No recorded activity in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <div className="flex gap-2">
        <Button
          appearance="form"
          variant="outline"
          disabled={cursors.length === 1 || query.isFetching}
          onClick={() => setCursors((value) => value.slice(0, -1))}
        >
          Previous page
        </Button>
        <Button
          appearance="form"
          variant="outline"
          disabled={
            !statement.nextCursor || snapshot === undefined || query.isFetching
          }
          onClick={() => {
            if (statement.nextCursor)
              setCursors((value) => [
                ...value,
                statement.nextCursor ?? undefined,
              ])
          }}
        >
          Next page
        </Button>
      </div>
    </div>
  )
}
