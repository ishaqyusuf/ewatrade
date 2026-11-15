"use client"

import { printPdf, removePrintFrame } from "@/lib/print-pdf"
import { downloadReportCsv } from "@/lib/report-csv"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import {
  Copy01Icon,
  Download04Icon,
  PrinterIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"
import {
  type ReportSharePack,
  reportPrintDocument,
  reportShareText,
} from "./report-share"

function canShareText() {
  return typeof navigator !== "undefined" && "share" in navigator
}

/**
 * "Share report" button and its modal: share the figures as a message (Web
 * Share on phones, copy elsewhere), download the spreadsheet, or print / save
 * as PDF. `build` runs only when the modal opens.
 */
export function ReportShareButton({
  build,
  disabled,
}: {
  build: () => ReportSharePack | null
  disabled?: boolean
}) {
  const [pack, setPack] = useState<ReportSharePack | null>(null)
  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => setPack(build())}
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          aria-hidden="true"
          data-icon="inline-start"
          icon={Share08Icon}
        />
        Share report
      </Button>
      <ReportShareDialog onClose={() => setPack(null)} pack={pack} />
    </>
  )
}

export function ReportShareDialog({
  onClose,
  pack,
}: {
  onClose: () => void
  pack: ReportSharePack | null
}) {
  const workflow = useDashboardWorkflow()
  const [notice, setNotice] = useState<string | null>(null)
  const [share, setShare] = useState(false)
  useEffect(() => setShare(canShareText()), [])
  useEffect(() => {
    if (!pack) {
      setNotice(null)
      removePrintFrame()
    }
  }, [pack])
  const text = pack ? reportShareText(pack) : ""
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open={Boolean(pack)}
    >
      <DialogContent className="grid content-start gap-5 rounded-[var(--ui-radius-surface)] p-6 sm:max-w-md">
        <DialogHeader className="pr-10">
          <DialogTitle>Share report</DialogTitle>
          <DialogDescription>{pack?.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {share ? (
            <Button
              onClick={async () => {
                workflow.track("report_share", "started")
                try {
                  await navigator.share({ text, title: pack?.title })
                  workflow.track("report_share", "completed")
                } catch {
                  // Closing the share sheet is not an error.
                }
              }}
              type="button"
            >
              <HugeiconsIcon
                aria-hidden="true"
                data-icon="inline-start"
                icon={Share08Icon}
              />
              Share as a message
            </Button>
          ) : null}
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text)
                setNotice("Copied. Paste it into a message.")
              } catch {
                setNotice("Couldn't copy. Try Print or save as PDF.")
              }
            }}
            type="button"
            variant={share ? "outline" : "default"}
          >
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-start"
              icon={Copy01Icon}
            />
            Copy figures
          </Button>
          <Button
            onClick={() => {
              if (!pack) return
              const url = URL.createObjectURL(
                new Blob([reportPrintDocument(pack)], { type: "text/html" }),
              )
              workflow.track("report_print", "started")
              printPdf(url, {
                onBlocked: () =>
                  setNotice("Your browser blocked printing. Allow pop-ups."),
                title: pack.title,
              })
            }}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-start"
              icon={PrinterIcon}
            />
            Print or save as PDF
          </Button>
          {pack?.csv ? (
            <Button
              onClick={() => {
                const file = pack.csv
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
                data-icon="inline-start"
                icon={Download04Icon}
              />
              Download spreadsheet (CSV)
            </Button>
          ) : null}
        </div>
        {notice ? (
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {notice}
          </output>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
