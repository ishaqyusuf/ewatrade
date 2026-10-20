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
          title="History"
          description="Changes to role, status and stores."
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
                    onClick={() => {
                      const cursor = query.data.nextCursor
                      if (cursor)
                        void open({
                          kind: "staff_history",
                          filters: { ...target.filters, cursor },
                        })
                    }}
                  >
                    Next page
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {query.isFetching
                    ? "Refreshing…"
                    : query.data.nextCursor
                      ? null
                      : "That’s everything."}
                </span>
              </>
            ) : null
          }
        >
          {!target ? (
            <p role="alert">
              This link no longer works. Ask the assistant again.
            </p>
          ) : query.isPending ? (
            <output aria-live="polite">Loading…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>You don’t have access to staff history.</p>
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
