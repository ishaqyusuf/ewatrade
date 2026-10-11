"use client"

import { useTRPC } from "@/trpc/client"
import { Button, cn } from "@ewatrade/ui"
import {
  ArrowTurnBackwardIcon,
  Cancel02Icon,
  Exchange01Icon,
  Invoice01Icon,
  MoneyReceive01Icon,
  Note01Icon,
  PackageDelivered01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import {
  OrderNoteAttachments,
  OrderNoteComposer,
} from "../order-activity-panel"
import {
  type ActivityEntry,
  type EventTone,
  type OrderTimelineItem,
  dayLabel,
  describeEvent,
  formatOrderTime,
  mergeActivity,
} from "./order-overview-model"

const TONE: Record<EventTone, string> = {
  default: "bg-muted text-muted-foreground",
  money: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  stock: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  change: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300",
}

const ICON: Record<OrderTimelineItem["kind"], typeof Invoice01Icon> = {
  created: Invoice01Icon,
  payment: MoneyReceive01Icon,
  refund: MoneyReceive01Icon,
  fulfilled: PackageDelivered01Icon,
  returned: ArrowTurnBackwardIcon,
  changed: Exchange01Icon,
  replaced: Exchange01Icon,
  cancelled: Cancel02Icon,
  completed: Tick02Icon,
}

/**
 * Everything that happened to the order, oldest first, with notes inline
 * and the note box at the foot. Entries added while it is open are marked.
 */
export function OrderActivityColumn({
  orderId,
  currencyCode,
  onOpenOrder,
  className,
}: {
  orderId: string
  currencyCode: string
  onOpenOrder: (orderId: string) => void
  className?: string
}) {
  const trpc = useTRPC()
  const timeline = useQuery(
    trpc.orders.timeline.queryOptions({ orderId }, { retry: false }),
  )
  const notes = useQuery(
    trpc.orders.activity.list.queryOptions({ orderId }, { retry: false }),
  )
  const entries = mergeActivity(timeline.data?.items ?? [], notes.data ?? [])
  // Ids present at first load; anything after that is "new".
  const seen = useRef<Set<string> | null>(null)
  if (!seen.current && timeline.isSuccess && notes.isSuccess)
    seen.current = new Set(entries.map((entry) => entry.id))
  const listEnd = useRef<HTMLLIElement>(null)
  const count = entries.length
  useEffect(() => {
    if (count && seen.current && seen.current.size < count)
      listEnd.current?.scrollIntoView({ block: "nearest" })
  }, [count])

  let lastDay = ""
  return (
    <section
      aria-labelledby="order-activity-heading"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h4 id="order-activity-heading" className="text-sm font-semibold">
          Activity
        </h4>
        <span className="text-xs text-muted-foreground">
          {timeline.isPending
            ? "Loading…"
            : `${count} ${count === 1 ? "entry" : "entries"}`}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {timeline.isError ? (
          <div role="alert" className="grid gap-2 text-sm">
            <p className="text-muted-foreground">
              Activity could not load. {timeline.error.message}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => void timeline.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {notes.isError ? (
          <p className="text-xs text-muted-foreground">
            Notes could not load: {notes.error.message}
          </p>
        ) : null}
        <ol className="grid">
          {entries.map((entry, index) => {
            const day = dayLabel(entry.at)
            const heading = day !== lastDay ? day : null
            lastDay = day
            return (
              <li
                key={entry.id}
                ref={index === entries.length - 1 ? listEnd : undefined}
              >
                {heading ? (
                  <p className="pt-2 pb-2 pl-10 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {heading}
                  </p>
                ) : null}
                <ActivityRow
                  entry={entry}
                  currencyCode={currencyCode}
                  last={index === entries.length - 1}
                  fresh={Boolean(seen.current && !seen.current.has(entry.id))}
                  onOpenOrder={onOpenOrder}
                />
              </li>
            )
          })}
        </ol>
      </div>
      <footer className="shrink-0 border-t border-border p-3">
        <OrderNoteComposer orderId={orderId} />
      </footer>
    </section>
  )
}

function ActivityRow({
  entry,
  currencyCode,
  last,
  fresh,
  onOpenOrder,
}: {
  entry: ActivityEntry
  currencyCode: string
  last: boolean
  fresh: boolean
  onOpenOrder: (orderId: string) => void
}) {
  const event = entry.kind === "event" ? entry.item : null
  const text = event ? describeEvent(event, currencyCode) : null
  return (
    <div
      className={cn(
        "relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 rounded-lg pb-4",
        fresh &&
          "animate-in fade-in-0 bg-primary/5 ring-1 ring-primary/30 motion-reduce:animate-none",
      )}
      data-fresh={fresh || undefined}
    >
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute top-8 bottom-0 left-[0.875rem] w-px bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 flex size-7 items-center justify-center rounded-full",
          text ? TONE[text.tone] : TONE.default,
        )}
      >
        <HugeiconsIcon
          icon={event ? ICON[event.kind] : Note01Icon}
          className="size-3.5"
        />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-sm font-medium">
            {text ? (
              <>
                {text.title}
                {text.amount ? (
                  <span
                    className={cn(
                      "ml-1",
                      text.tone === "danger"
                        ? "text-red-700 dark:text-red-300"
                        : "text-emerald-700 dark:text-emerald-300",
                    )}
                  >
                    {text.amount}
                  </span>
                ) : null}
              </>
            ) : entry.kind === "note" ? (
              <>
                {entry.note.actor?.name ?? "Team member"}
                {entry.note.source === "assistant" ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · via assistant
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
          <time
            dateTime={entry.at}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatOrderTime(entry.at)}
          </time>
        </div>
        {text?.detail ? (
          <p className="break-words text-xs text-muted-foreground">
            {text.detail}
          </p>
        ) : null}
        {text?.lines.length ? (
          <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
            {text.lines.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        {text?.linkLabel && event?.linkedOrder ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() =>
              event.linkedOrder && onOpenOrder(event.linkedOrder.id)
            }
          >
            {text.linkLabel} →
          </Button>
        ) : null}
        {entry.kind === "note" ? (
          <div className="mt-1 grid gap-2">
            {entry.note.body ? (
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
                {entry.note.body}
              </p>
            ) : null}
            <OrderNoteAttachments attachments={entry.note.attachments} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
