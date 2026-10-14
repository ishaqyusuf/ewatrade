"use client"

import type { BusinessNotificationReceiptView } from "@ewatrade/notifications/business-events"
import { Button, Tabs, TabsList, TabsTrigger } from "@ewatrade/ui"
import { BusinessNotificationRow } from "./business-notification-row"

export type InboxTab = "unread" | "all" | "archived"

export function BusinessNotificationInbox({
  tab,
  onTabChange,
  items,
  unreadCount,
  timeZone,
  now,
  isPending,
  isError,
  errorMessage,
  actionError,
  markAllPending,
  pendingIds,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRetry,
  onOpen,
  onMarkRead,
  onArchive,
  onMarkAllRead,
  onOpenPreferences,
}: {
  tab: InboxTab
  onTabChange: (tab: InboxTab) => void
  items: BusinessNotificationReceiptView[]
  unreadCount: number
  timeZone: string
  now: Date
  isPending: boolean
  isError: boolean
  errorMessage: string
  actionError: string | null
  markAllPending: boolean
  pendingIds: ReadonlySet<string>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  onRetry: () => void
  onOpen: (receipt: BusinessNotificationReceiptView) => void
  onMarkRead: (receipt: BusinessNotificationReceiptView) => void
  onArchive: (receipt: BusinessNotificationReceiptView) => void
  onMarkAllRead: () => void
  onOpenPreferences: () => void
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2">
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as InboxTab)}
        >
          <TabsList variant="line">
            <TabsTrigger value="unread">
              Unread{unreadCount ? ` ${unreadCount}` : ""}
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="flex gap-3 text-[13px]">
          <button
            type="button"
            className="underline underline-offset-3 disabled:text-muted-foreground disabled:no-underline"
            disabled={!unreadCount || markAllPending || isPending}
            onClick={onMarkAllRead}
          >
            Mark all read
          </button>
          <button
            type="button"
            className="underline underline-offset-3"
            onClick={onOpenPreferences}
          >
            Preferences
          </button>
        </span>
      </div>
      {actionError ? (
        <p
          role="alert"
          className="border-b bg-destructive/10 px-3.5 py-2 text-[13px] text-destructive"
        >
          {actionError}
        </p>
      ) : null}
      <div className="min-h-0 overflow-y-auto">
        {isPending ? (
          <output
            aria-live="polite"
            className="block px-3.5 py-8 text-center text-sm text-muted-foreground"
          >
            Loading alerts…
          </output>
        ) : isError ? (
          <div
            role="alert"
            className="grid justify-items-center gap-3 px-3.5 py-8 text-sm"
          >
            <p>{errorMessage}</p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : items.length ? (
          <ul>
            {items.map((receipt) => (
              <BusinessNotificationRow
                key={receipt.id}
                receipt={receipt}
                timeZone={timeZone}
                now={now}
                pending={pendingIds.has(receipt.id)}
                onOpen={onOpen}
                onMarkRead={onMarkRead}
                onArchive={onArchive}
              />
            ))}
          </ul>
        ) : (
          <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
            {tab === "unread"
              ? "You're all caught up."
              : tab === "archived"
                ? "No archived alerts."
                : "No alerts yet."}
          </p>
        )}
        {hasNextPage ? (
          <div className="flex justify-center py-3">
            <Button
              variant="outline"
              disabled={isFetchingNextPage}
              onClick={onLoadMore}
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
      <p className="border-t px-3.5 py-2.5 text-xs text-muted-foreground">
        Alerts are your own copy. Reading or archiving them never changes
        Business activity.
      </p>
    </div>
  )
}
