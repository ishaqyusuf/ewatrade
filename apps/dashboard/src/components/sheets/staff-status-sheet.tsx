"use client"
import { StaffStatusContent } from "@/components/staff-status-content"
import { StaffStatusSheetHeader } from "@/components/staff-status-sheet-header"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import { useStaffStatusParams } from "@/hooks/use-staff-status-params"
import { useTRPC } from "@/trpc/client"
import {
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

export function StaffStatusSheet({ timeZone }: { timeZone: string }) {
  const { isOpen, eventId, close } = useStaffStatusParams()
  const [, setRelated] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.staffStatusReceipt.queryOptions(
      { eventId: eventId ?? "" },
      { enabled: isOpen && Boolean(eventId), retry: false, staleTime: 0 },
    ),
  )
  const readable = query.isSuccess && !query.isFetching && !query.isPaused
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original staff status"
          description="Saved outcome and current membership are separate."
          header={
            readable ? <StaffStatusSheetHeader record={query.data} /> : null
          }
          footer={
            eventId ? (
              <Button
                variant="outline"
                disabled={query.isFetching || query.isPaused}
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            ) : null
          }
        >
          {!eventId ? (
            <p role="alert">
              This status link is invalid. Close it and open the original
              receipt.
            </p>
          ) : query.isPending || query.isFetching || query.isPaused ? (
            <output aria-live="polite">Loading original status…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                This original status is unavailable for your current business or
                access.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffStatusContent
              record={query.data}
              timeZone={timeZone}
              onOpenMember={() =>
                void setRelated({
                  ...closedAssistantObjectParams,
                  staffMember: staffMemberTargetSchema.parse({
                    kind: "staff_member",
                    membershipId: query.data.membershipId,
                  }).membershipId,
                })
              }
              onOpenHistory={() =>
                void setRelated({
                  ...closedAssistantObjectParams,
                  staffHistory: JSON.stringify(
                    staffHistoryTargetSchema.parse({
                      kind: "staff_history",
                      filters: { membershipId: query.data.membershipId },
                    }),
                  ),
                })
              }
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
