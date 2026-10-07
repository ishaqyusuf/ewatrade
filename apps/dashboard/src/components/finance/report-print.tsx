"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ewatrade/ui"
import { useRef, useState } from "react"
import type { FinanceReport } from "./report-csv"
import { buildFinanceReportPrintDocument } from "./report-print-document"

export function FinanceReportPrint({ report }: { report: FinanceReport }) {
  const workflow = useDashboardWorkflow()
  const [preview, setPreview] = useState<FinanceReport | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  return (
    <>
      <Button
        appearance="form"
        variant="outline"
        onClick={() => {
          workflow.track("report_print", "started")
          setPreview(report)
        }}
      >
        Print report
      </Button>
      {preview ? (
        <Dialog
          open={Boolean(preview)}
          onOpenChange={(open) => {
            if (!open) setPreview(null)
          }}
        >
          <DialogContent
            hideClose
            className="flex h-[90dvh] w-[min(900px,95vw)] max-w-none flex-col p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <DialogTitle className="font-medium">
                Print report · Snapshot {preview.snapshotSequence}
              </DialogTitle>
              <div className="flex gap-2">
                <Button
                  appearance="form"
                  onClick={() => {
                    if (frame.current?.contentWindow) {
                      frame.current.contentWindow.print()
                      workflow.track("report_print", "completed")
                    }
                  }}
                >
                  Print / Save PDF
                </Button>
                <Button
                  appearance="form"
                  variant="outline"
                  onClick={() => setPreview(null)}
                >
                  Close preview
                </Button>
              </div>
            </div>
            <DialogDescription className="pb-3 text-sm text-muted-foreground">
              Print the displayed snapshot or save it as a PDF using your
              browser.
            </DialogDescription>
            <iframe
              ref={frame}
              title="Financial report print preview"
              srcDoc={buildFinanceReportPrintDocument(preview)}
              className="min-h-0 w-full flex-1 border border-border bg-white"
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
