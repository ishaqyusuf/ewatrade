"use client"
import { StaffHistoryContent } from "@/components/staff-history/staff-history-content"
import { StaffHistorySheetHeader } from "@/components/staff-history/staff-history-sheet-header"
import { useStaffHistoryParams } from "@/hooks/use-staff-history-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

export function StaffHistorySheet() {
  const { isOpen, target, open, close } = useStaffHistoryParams()
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.staffHistoryPage.queryOptions(
      { ...target?.filters, limit: 10 },
      { enabled: isOpen && Boolean(target), retry: false, staleTime: 0 },
    ),
  )
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(value) => {
        if (!value) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Staff history"
          description="Original recorded membership and access changes."
          header={
            target ? <StaffHistorySheetHeader filters={target.filters} /> : null
          }
          footer={
            target && query.data && !query.isError ? (
              <>
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  Refresh
                </Button>
                {target.filters.cursor ? (
                  <Button
                    variant="outline"
                    disabled={query.isFetching}
                    onClick={() => {
                      void open({
                        kind: "staff_history",
                        filters: { ...target.filters, cursor: undefined },
                      })
                    }}
                  >
                    First page
                  </Button>
                ) : null}
                {query.data.nextCursor ? (
                  <Button
                    disabled={query.isFetching}
                    onClick={() =>
                      void open({
                        kind: "staff_history",
                        filters: {
                          ...target.filters,
                          cursor: query.data.nextCursor!,
                        },
                      })
                    }
                  >
                    Next page
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {query.isFetching
                    ? "Refreshing…"
                    : query.data.nextCursor
                      ? "More recorded events available"
                      : "End of available recorded results"}
                </span>
              </>
            ) : null
          }
        >
          {!target ? (
            <p role="alert">
              This history link is invalid. Close it and open a fresh result.
            </p>
          ) : query.isPending ? (
            <output aria-live="polite">Loading recorded staff history…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                Staff history is unavailable for your current access or setup.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffHistoryContent page={query.data} />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
