"use client"

import { StaffAccessContent } from "@/components/staff-access-content"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import { useStaffAccessParams } from "@/hooks/use-staff-access-params"
import { useTRPC } from "@/trpc/client"
import {
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

export function StaffAccessSheet({ timeZone }: { timeZone: string }) {
  const { isOpen, eventId, close } = useStaffAccessParams()
  const [, setRelated] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.staffAccessReceipt.queryOptions(
      { eventId: eventId ?? "" },
      { enabled: isOpen && Boolean(eventId), retry: false, staleTime: 0 },
    ),
  )
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original Store access"
          description="Saved access snapshots and current membership are separate."
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
              This access link is invalid. Close it and open the original
              receipt.
            </p>
          ) : query.isPending || query.isFetching || query.isPaused ? (
            <output aria-live="polite">Loading original Store access…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                This original access record is unavailable for your current
                business or access.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffAccessContent
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
