"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { formatFinanceDate } from "./format-date"
import { OpenFinanceSheet } from "./open-finance-sheet"
import { FinancePeriodAuditHistory } from "./period-audit-history"
import type { FinanceBook } from "./types"

export function FinancePeriodHistory({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const query = useQuery(trpc.finance.periods.queryOptions({ bookId: book.id }))
  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <section className="grid gap-4 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Close a month</h2>
        <OpenFinanceSheet mode="period" secondary>
          Close or reopen a month
        </OpenFinanceSheet>
      </div>
      <p className="text-sm text-muted-foreground">
        Closing stops changes to records up to that date.
      </p>
      {query.isPending ? (
        <output>Loading months…</output>
      ) : query.isError ? (
        <FormFeedback appearance="dashboard">
          {query.error.message}
        </FormFeedback>
      ) : (
        <>
          <p className="font-medium">
            {query.data.closedThrough
              ? `Closed up to ${formatFinanceDate(query.data.closedThrough)}`
              : "No month closed yet"}
          </p>
          <details
            onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
          >
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
              Close and reopen history
            </summary>
            {historyOpen ? (
              <FinancePeriodAuditHistory key={book.id} bookId={book.id} />
            ) : null}
          </details>
        </>
      )}
    </section>
  )
}
