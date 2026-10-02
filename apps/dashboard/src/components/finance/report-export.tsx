"use client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { buildFinanceReportCsv } from "./report-csv"
import { FinanceReportPrint } from "./report-print"

type Report = RouterOutputs["finance"]["reports"]

export function FinanceReportExport({ report }: { report: Report }) {
  function download() {
    const text = buildFinanceReportCsv(report)
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `finance-report-${new Date(report.through).toISOString().slice(0, 10)}-snapshot-${report.snapshotSequence}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button appearance="form" variant="outline" onClick={download}>
        Export report pack (CSV)
      </Button>
      <FinanceReportPrint report={report} />
    </div>
  )
}
