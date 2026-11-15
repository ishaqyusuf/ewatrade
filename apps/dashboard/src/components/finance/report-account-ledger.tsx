"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery } from "@tanstack/react-query"
import { financeSourceLabel } from "./bank-source-detail"
import { formatFinanceDate } from "./format-date"
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
  const {
    reportAccountId,
    reportFrom,
    reportThrough,
    reportSnapshot,
    setParams,
  } = useFinanceParams()
  const open = Boolean(
    reportAccountId && reportFrom && reportThrough && reportSnapshot,
  )
  const close = () =>
    void setParams({
      reportAccountId: null,
      reportFrom: null,
      reportThrough: null,
      reportSnapshot: null,
    })
  const from = reportFrom ? new Date(reportFrom) : null
  const through = reportThrough ? new Date(reportThrough) : null
  // Viewing one account's entries is a record view: a URL right sheet.
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      {open && reportAccountId && reportSnapshot ? (
        <SheetFrame title="Account entries">
          {!from ||
          !through ||
          !Number.isFinite(from.getTime()) ||
          !Number.isFinite(through.getTime()) ||
          !/^\d{1,19}$/.test(reportSnapshot) ? (
            <FormFeedback appearance="dashboard">
              This account link is out of date. Open it again from the report.
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
        </SheetFrame>
      ) : null}
    </Sheet>
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
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </div>
    )
  const first = query.data.pages[0]
  if (!first) return null
  const entries = query.data.pages.flatMap((page) => page.items)
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="font-semibold">{first.account.name}</h3>
        <p className="text-sm text-muted-foreground">
          {formatFinanceDate(from)} to {formatFinanceDate(through)}
        </p>
      </div>
      <dl data-summary-grid className="grid grid-cols-2 gap-2">
        {[
          ["Start", first.openingBalanceMinor],
          ["End", first.closingBalanceMinor],
          ["Debits", first.debitMinor],
          ["Credits", first.creditMinor],
        ].map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 rounded-[var(--ui-radius-item)] border border-border p-3"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">
              {money(value ?? "0")}
            </dd>
          </div>
        ))}
      </dl>
      <FinanceReportLedgerExport bookId={book.id} ledger={first} />
      {!entries.length ? (
        <p>No entries in this period.</p>
      ) : (
        <ol className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="grid gap-2 py-4 text-sm">
              <div className="flex flex-wrap justify-between gap-3">
                <p className="font-medium">{entry.description}</p>
                <span>{formatFinanceDate(entry.effectiveAt)}</span>
              </div>
              <p className="tabular-nums">
                Debit {money(entry.debitMinor)} · Credit{" "}
                {money(entry.creditMinor)} · Balance {money(entry.balanceMinor)}
              </p>
              <p className="break-all text-sm text-muted-foreground">
                {financeSourceLabel(entry.sourceKind)}
              </p>
              {entry.reversalOfId ? (
                <p>Undo of an earlier entry</p>
              ) : entry.reversedById ? (
                <p>Undone; original kept in history.</p>
              ) : null}
              {entry.sourceKind === "EXPENSE_BILL" ? (
                <Button
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
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more entries"}
        </Button>
      ) : null}
    </div>
  )
}
