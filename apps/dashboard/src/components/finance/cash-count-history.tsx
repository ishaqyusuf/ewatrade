"use client"
import {
  InlineRowCheckbox,
  InlineSelectionBar,
  useInlineSelection,
} from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { OpenFinanceSheet } from "./open-finance-sheet"
import type { FinanceBook } from "./types"

export function FinanceCashCountHistory({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const { setParams } = useFinanceParams()
  const query = useInfiniteQuery(
    trpc.finance.cashCounts.infiniteQueryOptions(
      { bookId: book.id, limit: 20 },
      { getNextPageParam: (page) => page.nextCursor ?? undefined },
    ),
  )
  const counts = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const countIds = useMemo(() => counts.map((count) => count.id), [counts])
  const selection = useInlineSelection({ ids: countIds, scope: book.id })
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Cash counts</h2>
        <OpenFinanceSheet mode="cash-count" secondary>
          Count cash
        </OpenFinanceSheet>
      </div>
      <p className="text-sm text-muted-foreground">
        Compare physical cash with recorded balances. Open a count to check
        whether later entries changed its history.
      </p>
      {query.isPending ? (
        <output>Loading cash counts…</output>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button appearance="form" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : !counts.length ? (
        <p className="py-6 text-muted-foreground">
          No cash counts recorded yet.
        </p>
      ) : (
        <div className="grid gap-1">
          <InlineSelectionBar
            label="Select all loaded cash counts"
            selection={selection}
          />
          <ol className="divide-y divide-border">
            {counts.map((count) => (
              <li
                key={count.id}
                className="flex items-start gap-3 py-4"
                data-state={
                  selection.isSelected(count.id) ? "selected" : undefined
                }
              >
                <span className="pt-0.5">
                  <InlineRowCheckbox
                    selection={selection}
                    id={count.id}
                    label={`Select cash count ${count.reference}`}
                  />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {count.accountName} · {count.reference}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(count.asOf).toLocaleString("en-NG", {
                        timeZone: book.timezone,
                      })}
                    </p>
                    <p className="mt-1 text-sm">
                      Counted{" "}
                      {formatFinanceMoney(
                        count.observedBalanceMinor,
                        book.currencyCode,
                      )}{" "}
                      · Difference at count{" "}
                      {formatFinanceMoney(
                        count.differenceAtCountMinor,
                        book.currencyCode,
                      )}
                    </p>
                  </div>
                  <Button
                    appearance="form"
                    variant="outline"
                    aria-label={`View cash count ${count.reference}`}
                    onClick={() =>
                      void setParams({
                        financeSheet: "cash-count-detail",
                        countId: count.id,
                      })
                    }
                  >
                    View count
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {query.hasNextPage ? (
        <Button
          appearance="form"
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more counts"}
        </Button>
      ) : null}
    </section>
  )
}
