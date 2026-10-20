"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { FinanceReportLedgerExport } from "./report-ledger-export"
import type { FinanceBook } from "./types"

export function ReportAccountLink({
  accountId,
  label,
  from,
  through,
  snapshot,
}: {
  accountId: string
  label: string
  from: Date
  through: Date
  snapshot: string
}) {
  const { setParams } = useFinanceParams()
  return (
    <button
      type="button"
      className="text-left underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
      onClick={() =>
        void setParams({
          reportAccountId: accountId,
          reportFrom: from.toISOString(),
          reportThrough: through.toISOString(),
          reportSnapshot: snapshot,
        })
      }
    >
      {label}
    </button>
  )
}
export function FinanceReportAccountLedger({ book }: { book: FinanceBook }) {
  const region = useRef<HTMLElement>(null)
  const {
    reportAccountId,
    reportFrom,
    reportThrough,
    reportSnapshot,
    setParams,
  } = useFinanceParams()
  useEffect(() => {
    if (reportAccountId && reportFrom && reportThrough && reportSnapshot)
      region.current?.scrollIntoView({ block: "start", behavior: "instant" })
  }, [reportAccountId, reportFrom, reportThrough, reportSnapshot])
  if (!reportAccountId || !reportFrom || !reportThrough || !reportSnapshot)
    return null
  const from = new Date(reportFrom)
  const through = new Date(reportThrough)
  return (
    <section ref={region} className="grid gap-4 border border-border p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-medium">Report account entries</h2>
        <Button
          appearance="form"
          variant="outline"
          onClick={() =>
            void setParams({
              reportAccountId: null,
              reportFrom: null,
              reportThrough: null,
              reportSnapshot: null,
            })
          }
        >
          Close account entries
        </Button>
      </div>
      {!Number.isFinite(from.getTime()) ||
      !Number.isFinite(through.getTime()) ||
      !/^\d{1,19}$/.test(reportSnapshot) ? (
        <FormFeedback appearance="dashboard">
          The account detail link has an invalid date or snapshot.
        </FormFeedback>
      ) : (
        <LedgerRows
          key={`${book.id}:${reportAccountId}:${reportFrom}:${reportThrough}:${reportSnapshot}`}
          book={book}
          accountId={reportAccountId}
          from={from}
          through={through}
          snapshot={reportSnapshot}
        />
      )}
    </section>
  )
}
function LedgerRows({
  book,
  accountId,
  from,
  through,
  snapshot,
}: {
  book: FinanceBook
  accountId: string
  from: Date
  through: Date
  snapshot: string
}) {
  const trpc = useTRPC()
  const { setParams } = useFinanceParams()
  const query = useInfiniteQuery(
    trpc.finance.accountLedger.infiniteQueryOptions(
      {
        bookId: book.id,
        accountId,
        from,
        through,
        snapshotSequence: snapshot,
        limit: 30,
      },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        staleTime: Number.POSITIVE_INFINITY,
      },
    ),
  )
  if (query.isPending) return <output>Loading account entries…</output>
  if (query.isError)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button appearance="form" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const first = query.data.pages[0]
  if (!first) return null
  const entries = query.data.pages.flatMap((page) => page.items)
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  return (
    <>
      <h3 className="font-medium">{first.account.name}</h3>
      <FinanceReportLedgerExport bookId={book.id} ledger={first} />
      <p className="text-xs text-muted-foreground">
        Posted finance entries only. Unposted Commerce records are excluded.
        Debit and credit describe accounting sides.
      </p>
      <p className="text-sm text-muted-foreground">
        {from.toISOString().slice(0, 10)} to{" "}
        {through.toISOString().slice(0, 10)} UTC · Snapshot {snapshot}. Positive
        balances represent the account’s normal {first.normalSide.toLowerCase()}{" "}
        side.
      </p>
      <p className="text-sm">
        Opening {money(first.openingBalanceMinor)} · Debits{" "}
        {money(first.debitMinor)} · Credits {money(first.creditMinor)} · Closing{" "}
        {money(first.closingBalanceMinor)}
      </p>
      {!entries.length ? (
        <p>No entries in this period.</p>
      ) : (
        <ol className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="grid gap-2 py-4 text-sm">
              <div className="flex flex-wrap justify-between gap-3">
                <p className="font-medium">{entry.description}</p>
                <span>
                  {new Date(entry.effectiveAt).toISOString().slice(0, 10)}
                </span>
              </div>
              <p className="tabular-nums">
                Debit {money(entry.debitMinor)} · Credit{" "}
                {money(entry.creditMinor)} · Balance {money(entry.balanceMinor)}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                Source: {entry.sourceKind} · {entry.sourceId}
              </p>
              {entry.reversalOfId ? (
                <p>Correction of entry {entry.reversalOfId}</p>
              ) : entry.reversedById ? (
                <p>Reversed; original retained.</p>
              ) : null}
              {entry.sourceKind === "EXPENSE_BILL" ? (
                <Button
                  appearance="form"
                  variant="outline"
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
            </li>
          ))}
        </ol>
      )}
      {query.hasNextPage ? (
        <Button
          appearance="form"
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more entries"}
        </Button>
      ) : null}
    </>
  )
}
