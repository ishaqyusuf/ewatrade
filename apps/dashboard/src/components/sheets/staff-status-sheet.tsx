"use client"
import { StaffStatusContent } from "@/components/staff-status-content"
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

function statusTitle(record: {
  eventType: string
  subject: { name: string | null }
}) {
  const name = record.subject.name?.trim()
  if (!name) return "Status change"
  return record.eventType === "SUSPENDED"
    ? `${name} was suspended`
    : record.eventType === "REACTIVATED"
      ? `${name} was reactivated`
      : "Status change"
}

function statusDescription(
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
          title={readable ? statusTitle(query.data) : "Status change"}
          description={
            readable ? statusDescription(query.data, timeZone) : undefined
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
