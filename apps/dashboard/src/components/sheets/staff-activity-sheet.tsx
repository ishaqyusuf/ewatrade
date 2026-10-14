"use client"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import { useStaffActivityParams } from "@/hooks/use-staff-activity-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type StaffActivityRecordRef,
  type StaffActivityTarget,
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useQueryStates } from "nuqs"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

type Event = RouterOutputs["retailOps"]["staffActivityPage"]["data"][number]
const relationLabel = {
  PERFORMED: "did",
  APPROVED: "approved",
  ASSIGNED: "was assigned",
} as const

/** Params that open the exact canonical original of one event. */
export function staffActivityOriginalParams(
  record: Event["record"] | StaffActivityRecordRef,
) {
  switch (record.kind) {
    case "order":
      return { orderSheet: "details", orderId: record.id }
    case "payment":
      return { orderSheet: "details", orderId: record.orderId }
    case "product":
      return { catalogDetail: record.id }
    case "stock_operation":
      return { inventoryOperation: record.id }
    case "stock_count":
      return { inventoryCount: record.id }
    case "service_job":
      return { serviceSheet: "job", jobId: record.id }
    // No journal-entry sheet exists; never guess another finance object.
    case "finance_entry":
      return null
  }
}

export type StaffActivityOpenContext = {
  /** Current user, business and Store; a change remounts every read. */
  scopeKey: string
  activeStoreId: string
  /** Originals this viewer's dashboard registers. */
  opens: { order: boolean; product: boolean; serviceJob: boolean }
}

/**
 * Whether one freshly authorized event can open its original here. Store
 * originals open only in their own Store, which is never switched for them.
 */
export function staffActivityOpen(
  event: Pick<Event, "record" | "store">,
  context: StaffActivityOpenContext,
) {
  const params = staffActivityOriginalParams(event.record)
  if (!params) return { unavailable: "Open from Finance" } as const
  const kind = event.record.kind
  if (
    ((kind === "order" || kind === "payment") && !context.opens.order) ||
    (kind === "product" && !context.opens.product) ||
    (kind === "service_job" && !context.opens.serviceJob)
  )
    return { unavailable: "Not available with your access" } as const
  if (
    kind !== "product" &&
    event.store &&
    event.store.id !== context.activeStoreId
  )
    return {
      unavailable: `Switch to ${event.store.name ?? "its Store"} to open`,
    } as const
  return { params } as const
}

const eventSummary = (event: Event) =>
  `${
    event.actor.coverage === "unknown"
      ? "Unknown (not recorded)"
      : event.actor.coverage === "unavailable"
        ? "Unavailable person"
        : event.actor.name
  } ${relationLabel[event.relation]}: ${event.outcome}`

/**
 * The exact events an assistant answer showed, re-read under current
 * authority before anything renders; each opens its original over the chat.
 */
export function StaffActivitySheet({
  timeZone,
  context,
}: {
  timeZone: string
  context: StaffActivityOpenContext
}) {
  const { isOpen, target, close } = useStaffActivityParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Staff activity"
          description="Recorded actions from the assistant answer, checked against your current access. Each opens its original record."
        >
          {!target ? (
            <p role="alert">
              This activity link is invalid. Close it and open the answer again.
            </p>
          ) : (
            // Keyed so every read and the opt-in current view reset for a new
            // target or a new user, business or Store.
            <StaffActivityBody
              key={`${context.scopeKey}:${JSON.stringify(target)}`}
              target={target}
              timeZone={timeZone}
              context={context}
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}

function StaffActivityBody({
  target,
  timeZone,
  context,
}: {
  target: StaffActivityTarget
  timeZone: string
  context: StaffActivityOpenContext
}) {
  const [, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  const trpc = useTRPC()
  // The saved target supplies identities and filters only; nothing renders
  // until the server re-reads those exact events under current authority.
  // Each mount owns its reads: a reopen never joins a request started under
  // earlier access, and closing aborts the requests this mount started.
  const [mount] = useState(nextReadMount)
  const shown = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffActivityShown.queryOptions(
        {
          ...target.filters,
          events: target.shown.map(({ stream, id }) => ({ stream, id })),
        },
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
  const fresh = freshShownRead(shown)
  const [showCurrent, setShowCurrent] = useState(false)
  const current = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffActivityPage.queryOptions(
        {
          ...target.filters,
          ...(target.cursor ? { cursor: target.cursor } : {}),
          limit: target.limit,
        },
        {
          enabled: showCurrent,
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
  const currentRead = freshShownRead(current)
  const loading = currentRead.state === "checking"
  const when = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso))
  const row = (event: Event) => (
    <ActivityRow
      key={`${event.stream}:${event.id}`}
      summary={eventSummary(event)}
      detail={`${event.record.label}${
        event.store?.name ? ` · ${event.store.name}` : ""
      } · ${when(event.at)}`}
      open={staffActivityOpen(event, context)}
      onOpen={(original) =>
        void setParams({ ...closedAssistantObjectParams, ...original })
      }
    />
  )
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-3">
        <h3 className="font-medium">Shown in the answer</h3>
        {fresh.state === "checking" ? (
          <output aria-live="polite">Checking your current access…</output>
        ) : fresh.state === "refused" ? (
          <p role="alert">
            This activity is unavailable for your business or access.
          </p>
        ) : (
          <ul className="grid gap-3">
            {target.shown.map((saved) => {
              const event = fresh.data.data.find(
                (fresh) =>
                  fresh.stream === saved.stream && fresh.id === saved.id,
              )
              return event ? (
                row(event)
              ) : (
                <li
                  key={`${saved.stream}:${saved.id}`}
                  className="border-b pb-3 text-muted-foreground"
                >
                  No longer available to you.
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Current activity for these filters</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={showCurrent && loading}
            onClick={() =>
              showCurrent ? void current.refetch() : setShowCurrent(true)
            }
          >
            {showCurrent ? "Refresh" : "Load current"}
          </Button>
        </div>
        {!showCurrent ? (
          <p className="text-muted-foreground">
            Re-reads the same filters now; new activity may differ from the
            answer.
          </p>
        ) : loading ? (
          <output aria-live="polite">Loading current activity…</output>
        ) : currentRead.state === "refused" ? (
          <p role="alert">
            Current activity is unavailable for your business or access.
          </p>
        ) : currentRead.state === "ready" ? (
          <>
            <p className="text-muted-foreground">
              {currentRead.data.data.length} of {currentRead.data.total}{" "}
              recorded actions now · the total counts every matching record
            </p>
            <ul className="grid gap-3">{currentRead.data.data.map(row)}</ul>
          </>
        ) : null}
      </section>
    </div>
  )
}

function ActivityRow({
  summary,
  detail,
  open,
  onOpen,
}: {
  summary: string
  detail: string
  open: ReturnType<typeof staffActivityOpen>
  onOpen: (
    original: NonNullable<ReturnType<typeof staffActivityOriginalParams>>,
  ) => void
}) {
  const params = "params" in open ? open.params : null
  return (
    <li className="flex items-start justify-between gap-3 border-b pb-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="font-medium break-words">{summary}</span>
        <span className="text-muted-foreground break-words">{detail}</span>
      </div>
      {params ? (
        <Button variant="outline" size="sm" onClick={() => onOpen(params)}>
          Open
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {"unavailable" in open ? open.unavailable : null}
        </span>
      )}
    </li>
  )
}
