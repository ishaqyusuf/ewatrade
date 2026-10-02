"use client"
import {
  collectCustomerLedgerExport,
  customerLedgerCsv,
} from "@/lib/customer-ledger/statement-export"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
export function CustomerLedgerExport({
  accountId,
  snapshotSequence,
}: { accountId: string; snapshotSequence: string }) {
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
        throw new Error("Statement snapshot changed. No file was downloaded.")
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
      link.download = `customer-statement-${accountId}-snapshot-${snapshotSequence}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "Export failed.")
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        appearance="form"
        variant="outline"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing snapshot…" : "Export full posted snapshot"}
      </Button>
      {error ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
