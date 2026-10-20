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
            ["Finance expected", count.expectedBalanceMinor],
            ["Cash you counted", count.observedBalanceMinor],
            ["Short or over", count.differenceMinor],
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
          ? "Look at this: a later entry changed this account for a time before the count. The count is kept as it was. Find that entry before you count again."
          : count.status === "ADJUSTED"
            ? "A fix was recorded for this difference. The count and its difference stay in history as they were."
            : count.status === "ADJUSTMENT_REVERSED"
              ? "The fix was undone. The count and difference stay in history as they were. Look at the difference again before deciding what to do."
              : count.status === "MATCHED"
                ? "The count matches what Finance expected."
                : "The count is different from what Finance expected. Look for missing or wrong entries before you fix it."}
      </p>
      {count.adjustment ? (
        <section className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">Fix history</h4>
          <p className="break-words text-sm">{count.adjustment.description}</p>
          <p className="text-sm text-muted-foreground">
            Fix recorded {new Date(count.adjustment.recordedAt).toISOString()}.
          </p>
          {count.adjustment.reversal ? (
            <p className="break-words text-sm">
              Undone{" "}
              {new Date(count.adjustment.reversal.recordedAt).toISOString()}.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Records have{" "}
            {count.snapshotSequence === count.currentSnapshotSequence
              ? "not changed"
              : "changed"}{" "}
            since this count.
          </p>
        </section>
      ) : null}
      {count.status === "DIFFERENCE" && !count.adjustment ? (
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setAdjusting(true)}
        >
          Fix the difference
        </Button>
      ) : null}
      {count.adjustment && !count.adjustment.reversal ? (
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setAdjusting(true)}
        >
          Undo the fix
        </Button>
      ) : null}
    </div>
  )
}
