"use client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { FinancePeriodCloseChecklistView } from "./period-close-checklist-view"
export function AssistantDayCloseView({
  checklist,
  day,
}: {
  checklist: RouterOutputs["finance"]["periodCloseChecklist"]
  day?: RouterOutputs["finance"]["reports"]
}) {
  const matches =
    day &&
    day.bookId === checklist.bookId &&
    day.snapshotSequence === checklist.snapshotSequence &&
    new Date(day.through).getTime() === new Date(checklist.through).getTime()
  return (
    <div className="grid gap-5">
      <p className="border border-border p-4 text-sm">
        Assistant close and reopen are unavailable. Unresolved reconciliation
        and source completeness need separate review. A physical cash count,
        stock closeout and fiscal close are distinct records.
      </p>
      {matches ? (
        <section className="grid gap-3 border border-border p-4">
          <h3 className="font-medium">Posted day summary</h3>
          <p className="text-sm text-muted-foreground">
            Tenant Finance Book · {new Date(day.from).toISOString()}–
            {new Date(day.through).toISOString()} UTC · snapshot{" "}
            {day.snapshotSequence}. Cash flow covers cash and bank; unsettled
            clearing is excluded.
          </p>
          <dl className="grid gap-3 text-sm">
            {(
              [
                ["Posted revenue", day.profitAndLoss.revenueMinor],
                ["Posted expenses", day.profitAndLoss.expensesMinor],
                ["Posted cost of sales", day.profitAndLoss.costOfSalesMinor],
                ["Posted net result", day.profitAndLoss.netProfitMinor],
                ["Cash and bank net change", day.cashFlow.netChangeMinor],
              ] as const
            ).map(([label, value]) => (
              <div className="flex justify-between gap-4" key={label}>
                <dt>{label}</dt>
                <dd className="font-medium tabular-nums">
                  {formatFinanceMoney(value, day.currencyCode)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Incomplete source coverage:{" "}
            {day.coverageGaps
              .map((gap) => gap.toLowerCase().replaceAll("_", " "))
              .join("; ")}
            . Posted zero does not prove no business activity.
          </p>
        </section>
      ) : day ? (
        <p role="alert">The summary scope changed. Refresh this review.</p>
      ) : null}
      <FinancePeriodCloseChecklistView checklist={checklist} />
    </div>
  )
}
