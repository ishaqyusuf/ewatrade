"use client"

import { FilterPills } from "@/components/inventory/filter-pills"
import {
  type StoreConversationQueueItem,
  formatStoreConversationDate,
  formatStoreConversationStatus,
  storeConversationRequestLine,
  storeConversationTitle,
} from "@/components/tables/store-conversations/columns"
import { Badge, Skeleton, cn } from "@ewatrade/ui"

export const inboxFilters = [
  { id: "all", label: "All" },
  { id: "late", label: "Reply late" },
  { id: "mine", label: "Mine" },
  { id: "nobody", label: "Nobody yet" },
] as const
export type InboxFilter = (typeof inboxFilters)[number]["id"]

export function inboxFilterOf(params: {
  assignment: string | null
  sla: string | null
}): InboxFilter {
  if (params.sla === "overdue") return "late"
  if (params.assignment === "mine") return "mine"
  if (params.assignment === "unassigned") return "nobody"
  return "all"
}

export function inboxFilterParams(filter: InboxFilter) {
  return {
    assignment:
      filter === "mine"
        ? ("mine" as const)
        : filter === "nobody"
          ? ("unassigned" as const)
          : null,
    sla: filter === "late" ? ("overdue" as const) : null,
    q: null,
    requestKinds: null,
    store: null,
  }
}

export function InboxFilterPills({
  value,
  onChange,
}: {
  value: InboxFilter
  onChange: (filter: InboxFilter) => void
}) {
  return (
    <FilterPills
      label="Show"
      options={inboxFilters}
      value={value}
      onChange={onChange}
    />
  )
}

/** Who answers this conversation, in plain words. */
export function inboxAssignee(item: StoreConversationQueueItem) {
  if (item.assignedToCurrentUser) return "You"
  return item.assignment.label ?? "Nobody yet"
}

/** One inbox: newest customer message first, each row opens the chat. */
export function ConversationInboxList({
  items,
  onOpen,
  timeZone,
}: {
  items: StoreConversationQueueItem[]
  onOpen: (conversationId: string) => void
  timeZone: string
}) {
  return (
    <ul
      aria-label="Conversations"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {items.map((item) => {
        const unread = item.unreadCustomerMessages > 0
        const status = storeConversationRequestLine(item)
        return (
          <li key={item.conversationId}>
            <button
              type="button"
              onClick={() => onOpen(item.conversationId)}
              className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  unread ? "bg-[var(--link)]" : "bg-transparent",
                )}
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span
                  className={cn(
                    "truncate text-base",
                    unread ? "font-semibold" : "font-medium",
                  )}
                >
                  {storeConversationTitle(item)}
                  {unread ? (
                    <span className="sr-only">
                      {`, ${item.unreadCustomerMessages} new`}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {[status, inboxAssignee(item)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="grid shrink-0 justify-items-end gap-1">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatStoreConversationDate(
                    item.lastCustomerActivityAt,
                    timeZone,
                  )}
                </span>
                {item.sla.state === "responded" ? null : (
                  <Badge
                    variant={
                      item.sla.state === "overdue" ? "destructive" : "secondary"
                    }
                  >
                    {formatStoreConversationStatus(item.sla.state)}
                  </Badge>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function ConversationInboxSkeleton() {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading conversations"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          key={index}
          className="flex min-h-[72px] items-center gap-3 px-4 py-3"
        >
          <span className="size-2.5" />
          <span className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
          </span>
          <Skeleton className="h-4 w-24" />
        </li>
      ))}
    </ul>
  )
}
