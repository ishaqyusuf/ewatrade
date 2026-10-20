"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FinanceCashAdjustmentForm } from "./cash-adjustment-form"
import { FinanceCashAdjustmentReversalForm } from "./cash-adjustment-reversal-form"
import { dayIn, plainDay } from "./review-changes"
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
        <Button onClick={() => void query.refetch()}>Try again</Button>
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
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
      <p>{count.reference}</p>
      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            ["Should hold", count.expectedBalanceMinor],
            ["Counted", count.observedBalanceMinor],
            [
              BigInt(count.differenceMinor) < BigInt(0)
                ? "Short"
                : BigInt(count.differenceMinor) > BigInt(0)
                  ? "Over"
                  : "Difference",
              (BigInt(count.differenceMinor) < BigInt(0)
                ? -BigInt(count.differenceMinor)
                : BigInt(count.differenceMinor)
              ).toString(),
            ],
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
            ? "The account was adjusted to this count. The count and its difference stay in history as they were."
            : count.status === "ADJUSTMENT_REVERSED"
              ? "The fix was undone. The count and difference stay in history as they were. Look at the difference again before deciding what to do."
              : count.status === "MATCHED"
                ? "The count matches what the account should hold."
                : "The count is different from what the account should hold. Look for missing sales or expenses first; adjust only a difference you can't explain."}
      </p>
      {count.adjustment ? (
        <section className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">Adjustment</h4>
          <p className="break-words text-sm">{count.adjustment.description}</p>
          <p className="text-sm text-muted-foreground">
            Adjusted{" "}
            {plainDay(dayIn(count.adjustment.recordedAt, book.timezone))}.
          </p>
          {count.adjustment.reversal ? (
            <p className="break-words text-sm">
              Undone{" "}
              {plainDay(
                dayIn(count.adjustment.reversal.recordedAt, book.timezone),
              )}
              .
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
        <Button variant="outline" onClick={() => setAdjusting(true)}>
          Adjust to count
        </Button>
      ) : null}
      {count.adjustment && !count.adjustment.reversal ? (
        <Button variant="outline" onClick={() => setAdjusting(true)}>
          Undo adjustment
        </Button>
      ) : null}
    </div>
  )
}
