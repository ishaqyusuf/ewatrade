"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import type { FinanceBillRow } from "@/components/finance/types"
import { Button } from "@ewatrade/ui"

function csv(value: string | number) {
  const text = String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function ExpenseBottomBar({
  rows,
  currency,
}: {
  rows: FinanceBillRow[]
  currency: string
}) {
  const workflow = useDashboardWorkflow()
  function download() {
    workflow.track("expense_export", "started")
    try {
      const text = [
        ["Selected expense records", `Exported ${new Date().toISOString()}`],
        [
          "Date",
          "Payee",
          "Description",
          "Currency",
          "Total (minor units)",
          "Paid (minor units)",
          "Outstanding (minor units)",
          "Status",
        ],
        ...rows.map((row) => [
          new Date(row.incurredAt).toISOString(),
          row.payeeName,
          row.description,
          currency,
          row.totalMinor,
          row.paidMinor,
          row.outstandingMinor,
          row.status,
        ]),
      ]
        .map((row) => row.map(csv).join(","))
        .join("\r\n")
      const url = URL.createObjectURL(
        new Blob([text], { type: "text/csv;charset=utf-8" }),
      )
      const link = document.createElement("a")
      link.href = url
      link.download = "selected-expenses.csv"
      link.click()
      workflow.track("expense_export", "completed", { item_count: rows.length })
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      workflow.track("expense_export", "failed")
      throw error
    }
  }

  return (
    <Button type="button" variant="outline" onClick={download}>
      Export selected
    </Button>
  )
}
