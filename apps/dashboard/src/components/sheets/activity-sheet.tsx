"use client"

import { ActivityDetailContent } from "@/components/activity/activity-detail-content"
import {
  type ActivityOpenContext,
  activityOriginalOpen,
} from "@/components/activity/activity-original"
import { ActivitySummary } from "@/components/activity/activity-row"
import { useActivityParams } from "@/hooks/use-activity-params"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { Button, Sheet } from "@ewatrade/ui"
import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useQueryStates } from "nuqs"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

export type ActivitySheetContext = ActivityOpenContext & {
  /** Current user, Business and Store; a change remounts every read. */
  scopeKey: string
}

/**
 * Read-only detail of one Business Activity event, freshly re-read under the
 * viewer's current access. No edit, delete or bulk action exists here.
 */
export function ActivitySheet({
  timeZone,
  context,
}: {
  timeZone: string
  context: ActivitySheetContext
}) {
  const { isOpen, eventKey, close } = useActivityParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen && eventKey ? (
        <ActivitySheetBody
          key={`${context.scopeKey}:${eventKey}`}
          eventKey={eventKey}
          timeZone={timeZone}
          context={context}
        />
      ) : null}
    </Sheet>
  )
}

function ActivitySheetBody({
  eventKey,
  timeZone,
  context,
}: {
  eventKey: string
  timeZone: string
  context: ActivitySheetContext
}) {
  const trpc = useTRPC()
  const { open, close } = useActivityParams()
  const [, setObjectParams] = useQueryStates(assistantObjectParams, {
    history: "push",
    shallow: true,
  })
  // Each mount owns its read: a reopen never joins a request started under
  // earlier access, and closing aborts the request this mount started.
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.activity.get.queryOptions(
        { key: eventKey },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const detail = read.state === "ready" ? read.data : undefined
  const original = detail
    ? activityOriginalOpen(detail.event, context)
    : undefined
  return (
    <SheetFrame
      title="Activity"
      header={
        detail ? (
          <p className="text-lg leading-snug">
            <ActivitySummary event={detail.event} showFlag={false} />
          </p>
        ) : null
      }
      footer={
        <>
          {original && "params" in original ? (
            <Button
              onClick={() => {
                void close()
                void setObjectParams({
                  ...closedAssistantObjectParams,
                  ...original.params,
                })
              }}
            >
              <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
              {original.label}
            </Button>
          ) : original ? (
            <span className="text-xs text-muted-foreground">
              {original.unavailable}
            </span>
          ) : null}
          <Button variant="outline" onClick={() => void close()}>
            Close
          </Button>
        </>
      }
    >
      {read.state === "refused" ? (
        <div role="alert" className="grid gap-3 text-sm">
          <p>
            This activity isn't available with your current access, or it no
            longer exists.
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : detail ? (
        <ActivityDetailContent
          detail={detail}
          timeZone={timeZone}
          onOpenRelated={(key) => void open(key)}
        />
      ) : (
        <output aria-live="polite" className="text-sm text-muted-foreground">
          Checking this activity against your current access…
        </output>
      )}
    </SheetFrame>
  )
}
