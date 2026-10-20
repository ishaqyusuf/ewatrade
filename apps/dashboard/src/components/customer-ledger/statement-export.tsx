"use client"
import {
  collectCustomerLedgerExport,
  customerLedgerCsv,
} from "@/lib/customer-ledger/statement-export"
import { useTRPC } from "@/trpc/client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
/** Downloads the whole statement as CSV for one saved snapshot. */
export function useCustomerLedgerExport({
  accountId,
  snapshotSequence,
  customerName,
}: { accountId: string; snapshotSequence: string; customerName?: string }) {
  const workflow = useDashboardWorkflow()
  const trpc = useTRPC()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const running = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function download() {
    if (running.current || !mounted.current) return
    running.current = true
    setBusy(true)
    setError(null)
    workflow.track("customer_statement_export", "started", {
      channel: "browser",
    })
    try {
      const read = (afterSequence?: string) =>
        client.fetchQuery(
          trpc.customerLedger.statement.queryOptions(
            { accountId, snapshotSequence, afterSequence, limit: 50 },
            { staleTime: Number.POSITIVE_INFINITY, retry: false },
          ),
        )
      const first = await read()
      if (
        first.accountId !== accountId ||
        first.snapshotSequence !== snapshotSequence
      )
        throw new Error(
          "The statement changed while preparing the file. Nothing was downloaded; try again.",
        )
      const entries = await collectCustomerLedgerExport(
        first,
        read,
        10000,
        () => !mounted.current,
      )
      if (!mounted.current) return
      const url = URL.createObjectURL(
        new Blob([customerLedgerCsv(first, entries)], {
          type: "text/csv;charset=utf-8",
        }),
      )
      const link = document.createElement("a")
      link.href = url
      const slug = customerName
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      link.download = slug
        ? `${slug}-statement.csv`
        : `customer-statement-${accountId}-snapshot-${snapshotSequence}.csv`
      link.click()
      workflow.track("customer_statement_export", "completed", {
        channel: "browser",
      })
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      workflow.track("customer_statement_export", "failed", {
        channel: "browser",
      })
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t prepare the file. Try again.",
        )
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return { download, busy, error }
}
