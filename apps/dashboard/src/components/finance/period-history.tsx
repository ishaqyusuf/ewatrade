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
    <section className="grid gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Months</h2>
        <OpenFinanceSheet mode="period" secondary>
          Close or reopen a month
        </OpenFinanceSheet>
      </div>
      <p className="text-sm text-muted-foreground">
        Close a month after you've checked your reports and records. Closing
        stops anyone changing records up to that date. It doesn't prove every
        naira is accounted for.
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
            <summary className="cursor-pointer text-sm font-medium">
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
