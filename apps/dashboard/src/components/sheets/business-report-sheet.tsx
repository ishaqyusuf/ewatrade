"use client"
import { BusinessReportContent } from "@/components/business-report-content"
import { BusinessReportSheetHeader } from "@/components/business-report-sheet-header"
import { businessReportOriginalParams } from "@/hooks/business-report-navigation"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import { useBusinessReportParams } from "@/hooks/use-business-report-params"
import { useTRPC } from "@/trpc/client"
import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

/** Typed native query options; the protected router owns all scope and authority. */
function BusinessReportQuery({ target }: { target: BusinessReportTarget }) {
  const trpc = useTRPC()
  const { open } = useBusinessReportParams()
  const request = target.request
  const query = useQuery(
    trpc.businessReporting.read.queryOptions(target, {
      retry: false,
      staleTime: 0,
    }),
  )
  const canPage =
    request.report === "item_sales" || request.report === "customer_debt"
  const changePage = (cursor?: string) => {
    if (request.report === "item_sales") {
      void open({
        ...target,
        request: {
          report: "item_sales",
          filters: { ...request.filters, cursor },
        },
      })
    } else if (request.report === "customer_debt") {
      void open({
        ...target,
        request: {
          report: "customer_debt",
          filters: { ...request.filters, cursor },
        },
      })
    }
  }
  const [, setOriginal] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  return (
    <>
      {query.isPending || query.isFetching || query.isPaused ? (
        <output aria-live="polite">Loading current report…</output>
      ) : query.isError ? (
        <div role="alert" className="grid gap-3">
          <p>
            This report is unavailable for your current access or setup. Return
            to its original business and Store or request a fresh report. No
            value or zero is inferred.
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <BusinessReportContent
          report={query.data}
          onOpen={(target) =>
            void setOriginal({
              ...closedAssistantObjectParams,
              ...businessReportOriginalParams(target),
            })
          }
        />
      )}
      {canPage &&
      query.data?.pagination &&
      !query.isFetching &&
      !query.isPaused &&
      !query.isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!("cursor" in request.filters && request.filters.cursor)}
            onClick={() => changePage()}
          >
            First page
          </Button>
          <Button
            variant="outline"
            disabled={!query.data.pagination.nextCursor}
            onClick={() =>
              changePage(query.data?.pagination?.nextCursor ?? undefined)
            }
          >
            Next page
          </Button>
        </div>
      ) : null}
      <div className="mt-4">
        <Button
          variant="outline"
          disabled={query.isFetching || query.isPaused}
          onClick={() => void query.refetch()}
        >
          Refresh report
        </Button>
      </div>
    </>
  )
}
export function BusinessReportSheet() {
  const { isOpen, target, close } = useBusinessReportParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Business report"
          description="Authorized source totals and original records."
          header={target ? <BusinessReportSheetHeader target={target} /> : null}
        >
          {target ? (
            <BusinessReportQuery key={JSON.stringify(target)} target={target} />
          ) : (
            <p role="alert">
              This report link is invalid. Close it and open a fresh report.
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
