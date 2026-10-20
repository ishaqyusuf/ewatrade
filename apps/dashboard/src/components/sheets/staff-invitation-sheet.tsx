"use client"
import { StaffInvitationContent } from "@/components/staff-invitation-content"
import { useStaffInvitationParams } from "@/hooks/use-staff-invitation-params"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

export function StaffInvitationSheet() {
  const { isOpen, commandId, close } = useStaffInvitationParams()
  const member = useStaffMemberParams()
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.staffInvitationCommand.queryOptions(
      { commandId: commandId ?? "" },
      { enabled: isOpen && Boolean(commandId), retry: false, staleTime: 0 },
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
          title="Staff invitation"
          description="Original review and current invitation status."
          footer={
            commandId && query.data && !query.isError ? (
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
          {!commandId ? (
            <p role="alert">
              This invitation link is invalid. Close it and open a fresh result.
            </p>
          ) : query.isPending || query.isFetching ? (
            <output aria-live="polite">Loading saved invitation…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                This invitation is unavailable for your current access or setup.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffInvitationContent
              command={query.data}
              onOpenMember={() =>
                void member.open(query.data.receipt.membershipId)
              }
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
