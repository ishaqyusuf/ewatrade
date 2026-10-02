"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { financeCsvCell } from "./finance-csv"

type Statement = RouterOutputs["finance"]["accountActivity"]

export function FinanceStatementExport({
  bookId,
  statement,
}: {
  bookId: string
  statement: Statement
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const cancelled = useRef(false)
  const running = useRef(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () => () => {
      cancelled.current = true
    },
    [],
  )
  async function download() {
    if (running.current) return
    running.current = true
    cancelled.current = false
    setProgress(0)
    setError(null)
    try {
      const rows: string[][] = [
        ["Account", statement.account.name],
        ["Currency", statement.currencyCode],
        ["From UTC", new Date(statement.from).toISOString()],
        ["Through UTC", new Date(statement.through).toISOString()],
        ["Snapshot", statement.snapshotSequence],
        ["Coverage", statement.coverage],
        [
          "Amounts",
          "Exact integer minor units; 100 minor units = 1 currency unit",
        ],
        ["Opening balance minor", statement.openingBalanceMinor],
        ["Closing balance minor", statement.closingBalanceMinor],
        [],
        [
          "Entry ID",
          "Sequence",
          "Effective UTC",
          "Recorded UTC",
          "Description",
          "Source kind",
          "Source ID",
          "Money in minor",
          "Money out minor",
          "Balance minor",
          "Reverses entry",
          "Reversed by entry",
        ],
      ]
      let cursor: string | undefined
      const seen = new Set<string>()
      let count = 0
      do {
        const page = await client.fetchQuery(
          trpc.finance.accountActivity.queryOptions(
            {
              bookId,
              accountId: statement.account.id,
              from: statement.from,
              through: statement.through,
              snapshotSequence: statement.snapshotSequence,
              cursor,
              limit: 50,
            },
            { staleTime: Number.POSITIVE_INFINITY },
          ),
        )
        if (cancelled.current) return
        for (const entry of page.items)
          rows.push([
            entry.id,
            entry.sequence,
            new Date(entry.effectiveAt).toISOString(),
            new Date(entry.recordedAt).toISOString(),
            entry.description,
            entry.sourceKind,
            entry.sourceId,
            entry.debitMinor,
            entry.creditMinor,
            entry.balanceMinor,
            entry.reversalOfId ?? "",
            entry.reversedById ?? "",
          ])
        count += page.items.length
        setProgress(count)
        cursor = page.nextCursor ?? undefined
        if (cursor && seen.has(cursor))
          throw new Error(
            "Statement pagination did not advance. Refresh and retry.",
          )
        if (cursor) seen.add(cursor)
      } while (cursor)
      if (cancelled.current) return
      const csv = rows
        .map((row) => row.map(financeCsvCell).join(","))
        .join("\r\n")
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      )
      const link = document.createElement("a")
      link.href = url
      link.download = `account-statement-${statement.account.id}-${statement.snapshotSequence}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      if (!cancelled.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to export statement.",
        )
    } finally {
      running.current = false
      if (!cancelled.current) setProgress(null)
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
            ? "Export full statement"
            : `Preparing ${progress} entries…`}
        </Button>
        {progress !== null ? (
          <Button
            appearance="form"
            variant="ghost"
            onClick={() => {
              cancelled.current = true
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
