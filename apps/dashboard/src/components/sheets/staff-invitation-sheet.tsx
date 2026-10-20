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
          title="Invite"
          description="What was sent and where it is now."
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
              This link no longer works. Ask the assistant again.
            </p>
          ) : query.isPending || query.isFetching ? (
            <output aria-live="polite">Loading…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>You can’t see this invite.</p>
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
