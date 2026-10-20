"use client"

import { downloadReportCsv } from "@/lib/report-csv"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { Button } from "@ewatrade/ui"
import { Download04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/** "Download CSV" for the figures on screen; `build` runs only on click. */
export function ReportDownloadButton({
  build,
  disabled,
}: {
  build: () => { fileName: string; text: string } | null
  disabled?: boolean
}) {
  const workflow = useDashboardWorkflow()
  return (
    <Button
      className="h-9 rounded-none"
      disabled={disabled}
      onClick={() => {
        const file = build()
        if (!file) return
        workflow.track("report_csv_export", "started")
        try {
          downloadReportCsv(file.fileName, file.text)
          workflow.track("report_csv_export", "completed")
        } catch (error) {
          workflow.track("report_csv_export", "failed")
          throw error
        }
      }}
      type="button"
      variant="outline"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="size-4"
        icon={Download04Icon}
      />
      Download CSV
    </Button>
  )
}
