"use client"
import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import {
  STATEMENT_PDF_PRESETS,
  type StatementPdfPreset,
  localDay,
  pdfBytes,
  statementPdfRange,
} from "@/lib/customer-ledger/statement-pdf"
import { printPdf, removePrintFrame } from "@/lib/print-pdf"
import { useTRPC } from "@/trpc/client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  ToggleGroup,
  ToggleGroupItem,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useEffect, useId, useMemo, useRef, useState } from "react"

const StatementPdfPreview = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("@/components/receipts/pdf-preview").then((mod) => mod.default),
      "body",
    ),
  {
    ssr: false,
    loading: () => <p className="py-8 text-sm">Loading preview…</p>,
  },
)

/**
 * Share, print or save one customer's statement as a PDF for chosen dates.
 * A modal (export/share), not a record sheet. The PDF is rendered by the API
 * from the same snapshot the statement page shows.
 */
export function StatementPdfDialog({
  open,
  onOpenChange,
  accountId,
  snapshotSequence,
  customerName,
  currencyCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  snapshotSequence?: string
  customerName?: string
  currencyCode: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <StatementPdfFrame
          accountId={accountId}
          snapshotSequence={snapshotSequence}
          customerName={customerName}
          currencyCode={currencyCode}
        />
      ) : null}
    </Dialog>
  )
}

function StatementPdfFrame({
  accountId,
  snapshotSequence,
  customerName,
  currencyCode,
}: {
  accountId: string
  snapshotSequence?: string
  customerName?: string
  currencyCode: string
}) {
  const trpc = useTRPC()
  const workflow = useDashboardWorkflow()
  const ids = useId()
  const today = localDay(new Date())
  const [preset, setPreset] = useState<StatementPdfPreset>("lastMonth")
  const [range, setRange] = useState(() => statementPdfRange("lastMonth"))
  const [showPaymentDetails, setShowPaymentDetails] = useState(true)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    trpc.customerLedger.statementPdf.queryOptions(
      {
        accountId,
        snapshotSequence,
        from: range.from,
        through: range.through,
        showPaymentDetails,
      },
      {
        enabled: range.from <= range.through,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        retry: false,
      },
    ),
  )
  const data = query.data
  useEffect(() => {
    if (!data) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(
      new Blob([pdfBytes(data.pdfBase64)], { type: "application/pdf" }),
    )
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [data])
  useEffect(() => removePrintFrame, [])

  function choose(value: StatementPdfPreset) {
    setPreset(value)
    if (value !== "custom") setRange(statementPdfRange(value))
  }
  function download() {
    if (!url || !data) return
    const link = document.createElement("a")
    link.href = url
    link.download = data.filename
    document.body.append(link)
    link.click()
    link.remove()
    setError(null)
    workflow.track("customer_statement_export", "completed", {
      channel: "browser",
    })
  }
  function print() {
    if (!url) return
    setError(null)
    printPdf(url, {
      title: "Statement to print",
      onBlocked: () =>
        setError("Allow pop-ups to print, or download the PDF and print it."),
    })
    workflow.track("report_print", "completed")
  }

  const file = useMemo(
    () =>
      data && typeof File !== "undefined"
        ? new File([pdfBytes(data.pdfBase64)], data.filename, {
            type: "application/pdf",
          })
        : null,
    [data],
  )
  const canShare = Boolean(
    file &&
      typeof navigator !== "undefined" &&
      navigator.canShare?.({ files: [file] }),
  )
  async function share() {
    if (!file) return
    setError(null)
    try {
      await navigator.share({ files: [file], title: file.name })
      workflow.track("customer_statement_export", "completed", {
        channel: "share",
      })
    } catch (failure) {
      if ((failure as Error)?.name !== "AbortError")
        setError("Couldn’t share. Download the PDF instead.")
    }
  }

  const ready = Boolean(url && data && !query.isFetching)
  const invalid = range.from > range.through
  return (
    <DialogContent className="flex max-w-[960px] flex-col gap-0 p-0 sm:w-[90vw]">
      <div className="grid gap-1 px-6 pt-6 pb-4 pr-14">
        <DialogTitle className="text-lg font-semibold">Statement</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {[customerName, currencyCode].filter(Boolean).join(" · ")}
        </DialogDescription>
      </div>
      <div className="grid gap-3 border-b border-border px-6 pb-4">
        <ToggleGroup<StatementPdfPreset>
          variant="outline"
          aria-label="Dates"
          value={[preset]}
          onValueChange={(values) => {
            if (values[0]) choose(values[0])
          }}
          className="max-w-full flex-wrap"
        >
          {STATEMENT_PDF_PRESETS.map((option) => (
            <ToggleGroupItem
              key={option.key}
              value={option.key}
              className="h-11"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {preset === "custom" ? (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${ids}-from`} className="font-medium">
                From
              </label>
              <DatePicker
                id={`${ids}-from`}
                value={range.from}
                max={today}
                onValueChange={(from) => {
                  if (from) setRange((current) => ({ ...current, from }))
                }}
              />
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${ids}-through`} className="font-medium">
                To
              </label>
              <DatePicker
                id={`${ids}-through`}
                value={range.through}
                min={range.from}
                max={today}
                aria-invalid={invalid}
                onValueChange={(through) => {
                  if (through) setRange((current) => ({ ...current, through }))
                }}
              />
            </div>
          </div>
        ) : null}
        <label
          htmlFor={`${ids}-pay`}
          className="flex cursor-pointer items-start gap-2 text-sm"
        >
          <Checkbox
            id={`${ids}-pay`}
            className="mt-0.5"
            checked={showPaymentDetails}
            onCheckedChange={(checked) =>
              setShowPaymentDetails(checked === true)
            }
          />
          <span className="grid">
            <span>Show how to pay</span>
            {showPaymentDetails && data && data.paymentAccountCount === 0 ? (
              <small className="text-xs text-muted-foreground">
                No bank details in Finance yet.
              </small>
            ) : null}
          </span>
        </label>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto bg-muted p-5">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {invalid ? (
          <p role="alert" className="text-sm text-destructive">
            The end date must be on or after the start date.
          </p>
        ) : query.isError ? (
          <div role="alert" className="grid justify-items-start gap-3 text-sm">
            <p>
              {!query.error.data ||
              query.error.data.code === "INTERNAL_SERVER_ERROR"
                ? "Couldn’t prepare the statement. Try again."
                : query.error.message}
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : ready && url ? (
          <StatementPdfPreview
            key={url}
            url={url}
            label="Statement PDF preview"
          />
        ) : (
          <output className="block py-8 text-sm" aria-live="polite">
            Preparing the statement…
          </output>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={!ready} onClick={print}>
          Print
        </Button>
        <Button
          variant={canShare ? "outline" : "default"}
          disabled={!ready}
          onClick={download}
        >
          Download PDF
        </Button>
        {canShare ? (
          <Button disabled={!ready} onClick={() => void share()}>
            Share
          </Button>
        ) : null}
      </div>
    </DialogContent>
  )
}
