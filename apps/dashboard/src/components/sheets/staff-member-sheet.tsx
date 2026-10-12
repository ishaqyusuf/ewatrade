"use client"
import { StaffMemberContent } from "@/components/staff-member-content"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

export function StaffMemberSheet({
  historyAllowed,
}: { historyAllowed: boolean }) {
  const { isOpen, membershipId, close, openHistory } = useStaffMemberParams()
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.staffDirectoryMember.queryOptions(
      { membershipId: membershipId ?? "" },
      { enabled: isOpen && Boolean(membershipId), retry: false, staleTime: 0 },
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
          title="Staff member"
          description="Current membership facts for this business."
          footer={
            membershipId && query.data && !query.isError ? (
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            ) : null
          }
        >
          {!membershipId ? (
            <p role="alert">
              This staff link is invalid. Close it and open a fresh result.
            </p>
          ) : query.isPending || query.isFetching ? (
            <output aria-live="polite">
              Loading current staff membership…
            </output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                Staff membership is unavailable for your current access or
                setup.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffMemberContent
              member={query.data}
              onOpenHistory={
                historyAllowed
                  ? () => void openHistory(query.data.membershipId)
                  : undefined
              }
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
