"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FinanceCashAdjustmentForm } from "./cash-adjustment-form"
import { FinanceCashAdjustmentReversalForm } from "./cash-adjustment-reversal-form"
import type { FinanceBook } from "./types"
export function FinanceCashCountDetail({
  book,
  countId,
}: { book: FinanceBook; countId: string }) {
  const [adjusting, setAdjusting] = useState(false)
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.cashCount.queryOptions({ bookId: book.id, countId }),
  )
  if (query.isPending) return <output>Loading cash count…</output>
  if (query.isError)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button appearance="form" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const count = query.data
  if (adjusting && count.adjustment && !count.adjustment.reversal)
    return (
      <FinanceCashAdjustmentReversalForm
        bookId={book.id}
        count={count}
        onBack={() => setAdjusting(false)}
      />
    )
  if (adjusting && count.status === "DIFFERENCE" && !count.adjustment)
    return (
      <FinanceCashAdjustmentForm
        bookId={book.id}
        count={count}
        onBack={() => setAdjusting(false)}
      />
    )
  return (
    <div className="grid gap-5">
      <div>
        <h3 className="font-semibold">{count.accountName}</h3>
        <p className="text-sm text-muted-foreground">
          {new Date(count.asOf).toLocaleString("en-NG", {
            timeZone: book.timezone,
          })}
        </p>
      </div>
      <p>{count.reference}</p>
      <dl className="grid gap-4">
        {(
          [
            ["Recorded balance at count", count.expectedBalanceMinor],
            ["Cash physically counted", count.observedBalanceMinor],
            ["Difference at count", count.differenceMinor],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-xl font-medium tabular-nums">
              {formatFinanceMoney(amount, book.currencyCode)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border border-border p-4 text-sm">
        {count.status === "REVIEW_REQUIRED"
          ? "Review required: a later entry changed this account’s history at or before the count time. The original count is preserved. Investigate the entry before recording a new count."
          : count.status === "ADJUSTED"
            ? "An adjustment was recorded for this difference. The original count and its difference remain unchanged in history."
            : count.status === "ADJUSTMENT_REVERSED"
              ? "The adjustment was reversed. The original count and difference remain unchanged; review the difference before making any new accounting decision."
              : count.status === "MATCHED"
                ? "Count matches the recorded cash balance at this time."
                : "The count differs from the recorded balance. Investigate missing or incorrect transactions before making a correction."}
      </p>
      {count.adjustment ? (
        <section className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">Adjustment history</h4>
          <p className="break-words text-sm">{count.adjustment.description}</p>
          <p className="text-sm text-muted-foreground">
            Original adjustment recorded{" "}
            {new Date(count.adjustment.recordedAt).toISOString()} UTC.
          </p>
          {count.adjustment.reversal ? (
            <p className="break-words text-sm">
              Reversed by journal entry {count.adjustment.reversal.id}, recorded{" "}
              {new Date(count.adjustment.reversal.recordedAt).toISOString()}{" "}
              UTC.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Count snapshot {count.snapshotSequence} · Current journal snapshot{" "}
            {count.currentSnapshotSequence}
          </p>
        </section>
      ) : null}
      {count.status === "DIFFERENCE" && !count.adjustment ? (
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setAdjusting(true)}
        >
          Adjust investigated difference
        </Button>
      ) : null}
      {count.adjustment && !count.adjustment.reversal ? (
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setAdjusting(true)}
        >
          Reverse cash adjustment
        </Button>
      ) : null}
    </div>
  )
}
