"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { Button } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import {
  type FinanceLedger,
  buildFinanceLedgerCsv,
  collectFinanceLedgerPages,
} from "./report-ledger-csv"

export function FinanceReportLedgerExport({
  bookId,
  ledger,
}: { bookId: string; ledger: FinanceLedger }) {
  const workflow = useDashboardWorkflow()
  const trpc = useTRPC()
  const client = useQueryClient()
  const generation = useRef(0)
  const running = useRef(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  useEffect(
    () => () => {
      generation.current += 1
      running.current = false
    },
    [],
  )
  async function download() {
    if (running.current) return
    running.current = true
    const attempt = ++generation.current
    const cancelled = () => generation.current !== attempt
    setProgress(0)
    setError(undefined)
    workflow.track("finance_ledger_export", "started", { channel: "browser" })
    try {
      const entries = await collectFinanceLedgerPages(
        ledger,
        (cursor) =>
          client.fetchQuery(
            trpc.finance.accountLedger.queryOptions(
              {
                bookId,
                accountId: ledger.account.id,
                from: ledger.from,
                through: ledger.through,
                snapshotSequence: ledger.snapshotSequence,
                cursor,
                limit: 50,
              },
              { staleTime: Number.POSITIVE_INFINITY },
            ),
          ),
        (count) => {
          if (!cancelled()) setProgress(count)
        },
        cancelled,
      )
      if (cancelled()) return
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", buildFinanceLedgerCsv(ledger, entries)], {
          type: "text/csv;charset=utf-8",
        }),
      )
      const link = document.createElement("a")
      link.href = url
      link.download = `report-account-${ledger.account.id}-snapshot-${ledger.snapshotSequence}.csv`
      link.click()
      workflow.track("finance_ledger_export", "completed", {
        channel: "browser",
      })
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      workflow.track("finance_ledger_export", "failed", { channel: "browser" })
      if (!cancelled())
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to export account.",
        )
    } finally {
      if (!cancelled()) {
        running.current = false
        setProgress(null)
      }
    }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="form"
          variant="outline"
          disabled={progress !== null}
          onClick={() => void download()}
        >
          {progress === null
            ? "Export full account CSV"
            : `Preparing ${progress} entries…`}
        </Button>
        {progress !== null ? (
          <Button
            appearance="form"
            variant="ghost"
            onClick={() => {
              generation.current += 1
              workflow.track("finance_ledger_export", "cancelled")
              running.current = false
              setProgress(null)
            }}
          >
            Cancel export
          </Button>
        ) : null}
      </div>
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
    </div>
  )
}
