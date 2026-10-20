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

function accessTitle(record: { subject: { name: string | null } }) {
  const name = record.subject.name?.trim()
  return name ? `${name}’s access changed` : "Access change"
}

function accessDescription(
  record: { happenedAt: string; actor: { name: string | null } },
  timeZone: string,
) {
  const when = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(record.happenedAt))
  const by = record.actor.name?.trim()
  return by ? `${when} by ${by}` : when
}

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
          title={readable ? accessTitle(query.data) : "Access change"}
          description={
            readable ? accessDescription(query.data, timeZone) : undefined
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
              This link no longer works. Ask the assistant again.
            </p>
          ) : query.isPending || query.isFetching || query.isPaused ? (
            <output aria-live="polite">Loading…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>You can’t see this change.</p>
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
