"use client"

import { ActivityCategoryIcon } from "@/components/activity/activity-category-icon"
import {
  formatActivityTime,
  groupActivityByDay,
} from "@/components/activity/activity-format"
import {
  ActivityAmount,
  ActivityMeta,
  ActivityTitle,
} from "@/components/activity/activity-row"
import type { BusinessNotificationReceiptView } from "@ewatrade/notifications/business-events"
import { Button, cn } from "@ewatrade/ui"
import { Archive01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function BusinessNotificationRow({
  receipt,
  timeZone,
  now,
  pending,
  onOpen,
  onMarkRead,
  onArchive,
}: {
  receipt: BusinessNotificationReceiptView
  timeZone: string
  now: Date
  pending: boolean
  onOpen: (receipt: BusinessNotificationReceiptView) => void
  onMarkRead: (receipt: BusinessNotificationReceiptView) => void
  onArchive: (receipt: BusinessNotificationReceiptView) => void
}) {
  const { event, state } = receipt
  const unread = state === "unread"
  const day = groupActivityByDay([event], timeZone, now)[0]?.title
  const when = [day, formatActivityTime(event.occurredAt, timeZone)]
    .filter(Boolean)
    .join(" ")
  return (
    <li className="flex items-stretch border-b">
      <button
        type="button"
        onClick={() => onOpen(receipt)}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-3.5 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-3 size-[7px] shrink-0 rounded-full",
            unread && "bg-blue-600 dark:bg-blue-400",
          )}
        />
        <ActivityCategoryIcon category={event.category} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "text-[13.5px]",
              !unread && "text-muted-foreground [&_strong]:text-foreground",
            )}
          >
            <ActivityTitle event={event} />
          </span>
          <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
            <ActivityMeta event={event} showStore extra={[when]} />
          </span>
        </span>
        <ActivityAmount event={event} />
        <span className="sr-only">{unread ? "Unread" : "Read"}</span>
      </button>
      <span className="flex items-center gap-0.5 pr-2">
        {unread ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-none"
            aria-label="Mark as read"
            title="Mark as read"
            disabled={pending}
            onClick={() => onMarkRead(receipt)}
          >
            <HugeiconsIcon icon={Tick02Icon} className="size-4" />
          </Button>
        ) : null}
        {state !== "archived" ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-none"
            aria-label="Archive alert"
            title="Archive"
            disabled={pending}
            onClick={() => onArchive(receipt)}
          >
            <HugeiconsIcon icon={Archive01Icon} className="size-4" />
          </Button>
        ) : null}
      </span>
    </li>
  )
}
