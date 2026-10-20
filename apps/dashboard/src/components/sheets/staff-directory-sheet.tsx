"use client"
import { StaffDirectoryContent } from "@/components/staff-directory-content"
import { StaffDirectoryPagination } from "@/components/staff-directory-pagination"
import { StaffDirectorySheetHeader } from "@/components/staff-directory-sheet-header"
import { useStaffDirectorySheetParams } from "@/hooks/use-staff-directory-sheet-params"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

export function StaffDirectorySheet() {
  const { isOpen, target, open, close } = useStaffDirectorySheetParams()
  const { open: openMember } = useStaffMemberParams()
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.staffDirectoryPage.queryOptions(
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
          title="Staff"
          description="Everyone in your business."
          header={
            target ? (
              <StaffDirectorySheetHeader
                key={JSON.stringify({ ...target.filters, cursor: undefined })}
                filters={target.filters}
                disabled={query.isFetching}
                onApply={(value) => void open(value)}
              />
            ) : null
          }
          footer={
            target && query.data && !query.isError ? (
              <StaffDirectoryPagination
                target={target}
                nextCursor={query.data.nextCursor}
                disabled={query.isFetching}
                onOpen={(value) => void open(value)}
                onRefresh={() => void query.refetch()}
              />
            ) : null
          }
        >
          {!target ? (
            <p role="alert">
              This link no longer works. Ask the assistant again.
            </p>
          ) : query.isPending || query.isFetching ? (
            <output aria-live="polite">Loading…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>You don’t have access to staff.</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffDirectoryContent
              page={query.data}
              filtered={Boolean(
                target.filters.search ||
                  target.filters.role ||
                  target.filters.status ||
                  target.filters.assignmentStoreId,
              )}
              continued={Boolean(target.filters.cursor)}
              onOpenMember={(membershipId) => void openMember(membershipId)}
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
