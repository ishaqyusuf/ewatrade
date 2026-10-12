"use client"
import { AssistantDayCloseView } from "@/components/finance/assistant-day-close-view"
import { assistantFinanceReadState } from "@/components/finance/assistant-finance-read-state"
import { useTRPC } from "@/trpc/client"
import { generalDayCloseInput } from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"
export function AssistantDayCloseSheet() {
  const [{ assistantDayCloseBook, assistantDayCloseThrough }, setParams] =
    useQueryStates(
      {
        assistantDayCloseBook: parseAsString,
        assistantDayCloseThrough: parseAsString,
      },
      { history: "push" },
    )
  const input = generalDayCloseInput.safeParse({
    bookId: assistantDayCloseBook,
    through: assistantDayCloseThrough,
  })
  const trpc = useTRPC()
  const checklist = useQuery(
    trpc.finance.periodCloseChecklist.queryOptions(
      {
        bookId: input.success ? input.data.bookId : "",
        through: input.success ? new Date(input.data.through) : new Date(0),
      },
      { enabled: Boolean(input.success), retry: false, staleTime: 0 },
    ),
  )
  const midnight = new Date(
    `${input.success ? input.data.through.slice(0, 10) : "1970-01-01"}T00:00:00.000Z`,
  )
  const from =
    checklist.data && midnight < new Date(checklist.data.from)
      ? new Date(checklist.data.from)
      : midnight
  const report = useQuery(
    trpc.finance.reports.queryOptions(
      {
        bookId: input.success ? input.data.bookId : "",
        from,
        through: input.success ? new Date(input.data.through) : new Date(0),
        snapshotSequence: checklist.data?.snapshotSequence,
      },
      {
        enabled: Boolean(
          input.success &&
            checklist.data &&
            !checklist.isFetching &&
            !checklist.isError,
        ),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  const checklistState = assistantFinanceReadState(input.success, checklist)
  const reportState = assistantFinanceReadState(input.success, report)
  return (
    <Sheet
      open={Boolean(assistantDayCloseBook)}
      onOpenChange={(open) => {
        if (!open)
          void setParams({
            assistantDayCloseBook: null,
            assistantDayCloseThrough: null,
          })
      }}
    >
      {assistantDayCloseBook ? (
        <SheetFrame
          title="Day-close review"
          description="Canonical posted facts and unresolved checks; no close is performed."
        >
          {checklistState === "invalid" ? (
            <p role="alert">
              Choose the original Finance Book and exact completed UTC cutoff.
            </p>
          ) : checklistState === "loading" ? (
            <output>Loading closing checklist…</output>
          ) : checklist.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{checklist.error.message}</p>
              <Button
                variant="outline"
                onClick={() => void checklist.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : checklist.isSuccess ? (
            <>
              {reportState === "loading" ? (
                <output>Loading posted day summary…</output>
              ) : report.isError ? (
                <div role="alert" className="grid gap-3">
                  <p>Day summary unavailable: {report.error.message}</p>
                  <Button
                    variant="outline"
                    onClick={() => void report.refetch()}
                  >
                    Retry summary
                  </Button>
                </div>
              ) : null}
              <AssistantDayCloseView
                checklist={checklist.data}
                day={reportState === "ready" ? report.data : undefined}
              />
            </>
          ) : null}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
