"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useYearEndParams } from "@/hooks/use-year-end-params"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Sheet,
  Skeleton,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { formatFinanceDate } from "./format-date"
import type { FinanceBook } from "./types"
import { FinanceYearEndPreviewView } from "./year-end-preview"
import { FinanceYearEndSettingsForm } from "./year-end-settings-form"
import {
  financeFiscalMonths,
  financeYearEndErrorKind,
  financeYearEndLabel,
} from "./year-end-state"

function NotAllowed() {
  return (
    <Alert variant="destructive" appearance="dashboard">
      <AlertTitle>Only the Owner or an Admin can see the year end</AlertTitle>
      <AlertDescription>
        Ask the Owner if you need it. Your access to Finance may have changed.
      </AlertDescription>
    </Alert>
  )
}

/**
 * Year end on Finance Reports: choose when the year ends and preview the
 * profit moving to owner's money. Closing the year isn't built yet, so the
 * preview always says it can't close.
 */
export function FinanceYearEnd({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const { view, open, close } = useYearEndParams()
  const fiscal = useQuery(
    trpc.finance.fiscalCalendar.queryOptions(
      { bookId: book.id },
      { retry: false },
    ),
  )
  const calendar = fiscal.data?.calendar ?? null
  const preview = useQuery(
    trpc.finance.yearEndPreview.queryOptions(
      { bookId: book.id },
      {
        enabled: Boolean(calendar),
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
    ),
  )
  const previewError = preview.error
    ? financeYearEndErrorKind(preview.error)
    : null
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)

  let body: ReactNode
  if (fiscal.isPending) body = <output>Loading year end…</output>
  else if (fiscal.isError)
    body =
      financeYearEndErrorKind(fiscal.error) === "forbidden" ? (
        <NotAllowed />
      ) : (
        <FormFeedback appearance="dashboard">
          {fiscal.error.message}
        </FormFeedback>
      )
  else if (!calendar)
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Choose when your business year ends. At year end, the profit for the
          year moves into owner&apos;s money.
        </p>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => void open("settings")}
        >
          Choose year end
        </Button>
      </>
    )
  else if (previewError === "forbidden") body = <NotAllowed />
  else {
    const data = preview.data
    const months = data
      ? financeFiscalMonths(data.fiscalStart, data.fiscalEnd)
      : null
    body = (
      <>
        <dl className="grid border border-border sm:grid-cols-3">
          <div className="grid gap-1 border-b border-border p-4 sm:border-r sm:border-b-0">
            <dt className="text-sm text-muted-foreground">Your year ends</dt>
            <dd className="font-medium">
              {financeYearEndLabel(calendar.startMonth, calendar.startDay)}
            </dd>
            <dd>
              <button
                type="button"
                className="text-sm font-medium underline underline-offset-4"
                onClick={() => void open("settings")}
              >
                Change
              </button>
            </dd>
          </div>
          <div className="grid gap-1 border-b border-border p-4 sm:border-r sm:border-b-0">
            <dt className="text-sm text-muted-foreground">This year</dt>
            {data ? (
              <>
                <dd className="font-medium tabular-nums">
                  {formatFinanceDate(data.fiscalStart)} –{" "}
                  {formatFinanceDate(data.fiscalEnd)}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {data.firstPeriodStub ? "First year · " : ""}
                  {months} {months === 1 ? "month" : "months"}
                </dd>
              </>
            ) : preview.isPending ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <dd>—</dd>
            )}
          </div>
          <div className="grid gap-1 p-4">
            <dt className="text-sm text-muted-foreground">
              {data && BigInt(data.earningsMinor) < BigInt(0)
                ? "Loss for the year"
                : "Profit for the year"}
              {data && !data.cutoffCompleted ? " so far" : ""}
            </dt>
            {data ? (
              <>
                <dd className="font-medium tabular-nums">
                  {money(data.earningsMinor)}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  Moves to owner&apos;s money at year end
                </dd>
              </>
            ) : preview.isPending ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <dd>—</dd>
            )}
          </div>
        </dl>
        {preview.isError ? (
          <FormFeedback appearance="dashboard">
            We couldn&apos;t prepare the year-end preview.{" "}
            {preview.error.message}
          </FormFeedback>
        ) : null}
        {!fiscal.data.controlValid ? (
          <p className="text-sm text-destructive">
            The Retained earnings account needs fixing before the preview can
            run.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="destructive">Can&apos;t close yet</Badge>
          <div className="flex gap-2">
            {preview.isError ? (
              <Button variant="outline" onClick={() => void preview.refetch()}>
                Try again
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={!preview.data}
              onClick={() => void open("preview")}
            >
              See year-end preview
            </Button>
          </div>
        </div>
      </>
    )
  }

  const sheetOpen =
    (view === "settings" && Boolean(fiscal.data)) ||
    (view === "preview" && Boolean(preview.data))
  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <h2 className="text-lg font-medium">Year end</h2>
      {body}
      <Sheet
        open={sheetOpen}
        onOpenChange={(next) => {
          if (!next) void close()
        }}
      >
        {view === "settings" && fiscal.data ? (
          <SheetFrame title="Choose year end">
            <FinanceYearEndSettingsForm
              book={book}
              fiscal={fiscal.data}
              onCancel={() => void close()}
              onSaved={() => void open("preview")}
            />
          </SheetFrame>
        ) : view === "preview" && preview.data ? (
          <SheetFrame
            title="Year-end preview"
            popupClassName="sm:w-[min(640px,100vw)] sm:max-w-[640px]"
            footer={
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Closing the year isn&apos;t available yet.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void close()}>
                    Done
                  </Button>
                  <Button disabled>Close the year</Button>
                </div>
              </div>
            }
          >
            <FinanceYearEndPreviewView preview={preview.data} />
          </SheetFrame>
        ) : null}
      </Sheet>
    </section>
  )
}
