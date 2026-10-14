"use client"

import type {
  BusinessActivityCoverage,
  BusinessActivityView,
} from "@ewatrade/notifications/business-events"
import { Button, Skeleton } from "@ewatrade/ui"
import { Activity01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo } from "react"
import { ActivityDateGroup } from "./activity-date-group"
import { groupActivityByDay } from "./activity-format"

export function ActivityFeed({
  items,
  timeZone,
  now,
  filtered,
  coverage,
  hasNextPage,
  isFetchingNextPage,
  nextPageError,
  onLoadMore,
  onClearFilters,
  onOpen,
  showStore,
}: {
  items: BusinessActivityView[]
  timeZone: string
  now: Date
  filtered: boolean
  coverage: BusinessActivityCoverage | null
  hasNextPage: boolean
  isFetchingNextPage: boolean
  nextPageError: boolean
  onLoadMore: () => void
  onClearFilters: () => void
  onOpen: (event: BusinessActivityView, trigger: HTMLButtonElement) => void
  /** Name each row's Store (several Stores, not filtered to one). */
  showStore: boolean
}) {
  const groups = useMemo(
    () => groupActivityByDay(items, timeZone, now),
    [items, timeZone, now],
  )
  return (
    <div>
      {coverage && !coverage.complete ? (
        <p className="mt-3 border bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          {coverage.detail}
        </p>
      ) : null}
      {groups.length ? (
        groups.map((group) => (
          <ActivityDateGroup
            key={group.day}
            group={group}
            timeZone={timeZone}
            showStore={showStore}
            onOpen={onOpen}
          />
        ))
      ) : (
        <ActivityEmptyState
          filtered={filtered}
          partial={Boolean(coverage && !coverage.complete)}
          onClearFilters={onClearFilters}
        />
      )}
      {hasNextPage || nextPageError ? (
        <div className="flex flex-col items-center gap-2 py-6">
          {nextPageError ? (
            <p role="alert" className="text-sm text-muted-foreground">
              More activity couldn't load.
            </p>
          ) : null}
          <Button
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage
              ? "Loading…"
              : nextPageError
                ? "Try again"
                : "Load more"}
          </Button>
        </div>
      ) : groups.length ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          End of recorded activity for this period
        </p>
      ) : null}
    </div>
  )
}

export function ActivityEmptyState({
  filtered,
  partial,
  onClearFilters,
}: {
  filtered: boolean
  partial: boolean
  onClearFilters: () => void
}) {
  return (
    <div className="mt-3 flex min-h-56 flex-col items-center justify-center border border-dashed px-5 text-center">
      <HugeiconsIcon
        icon={Activity01Icon}
        className="size-6 text-muted-foreground"
      />
      <p className="mt-3 font-medium">
        {filtered
          ? "No activity matches these filters"
          : partial
            ? "No recorded activity found yet"
            : "No activity in this period"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Try another person, Store or date range."
          : partial
            ? "Some older history isn't available, so this may not be everything."
            : "Recorded orders, payments and staff changes appear here."}
      </p>
      {filtered ? (
        <Button variant="outline" className="mt-4" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}

export function ActivityFeedSkeleton() {
  return (
    <output aria-label="Loading activity" className="mt-6 block">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          className="flex items-start gap-3.5 border-b px-2 py-3"
        >
          <Skeleton className="size-8 rounded-none" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5 rounded-none" />
            <Skeleton className="h-3 w-2/5 rounded-none" />
          </div>
          <Skeleton className="h-4 w-16 rounded-none" />
        </div>
      ))}
    </output>
  )
}
