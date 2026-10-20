"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
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
        <h2 className="text-lg font-medium">Period date locks</h2>
        <OpenFinanceSheet mode="period" secondary>
          Close or reopen period
        </OpenFinanceSheet>
      </div>
      <p className="text-sm text-muted-foreground">
        Lock reviewed posting dates after checking reports and reconciling
        source records. Date locks do not confirm that all business activity has
        been recorded.
      </p>
      {query.isPending ? (
        <output>Loading period history…</output>
      ) : query.isError ? (
        <FormFeedback appearance="dashboard">
          {query.error.message}
        </FormFeedback>
      ) : (
        <>
          <p className="font-medium">
            {query.data.closedThrough
              ? `Locked through ${new Date(query.data.closedThrough).toISOString().slice(0, 10)} UTC`
              : "No closed posting period"}
          </p>
          <details
            onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-medium">
              Close/reopen history
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
