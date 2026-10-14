"use client"

import {
  ActivityFeed,
  ActivityFeedSkeleton,
} from "@/components/activity/activity-feed"
import { showActivityStore } from "@/components/activity/activity-format"
import { ActivityHeader } from "@/components/activity/activity-header"
import { ActivityPersonPicker } from "@/components/activity/activity-person-picker"
import { isAccessDrift } from "@/components/activity/activity-read-errors"
import { ActivitySearchFilter } from "@/components/activity/activity-search-filter"
import { ActivityViewerProvider } from "@/components/activity/activity-viewer"
import { ScrollableContent } from "@/components/scrollable-content"
import { getActivityListPageInput } from "@/hooks/use-activity-filter-params"
import {
  useActivityFilterParams,
  useActivityParams,
} from "@/hooks/use-activity-params"
import { useTRPC } from "@/trpc/client"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import type { BusinessActivityPage } from "@ewatrade/notifications/business-events"
import { Button } from "@ewatrade/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useState } from "react"

/** Fresh, mount-owned reads: never joined across user, Business or Store. */
const freshRead = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  trpc: { abortOnUnmount: true },
} as const

export function ActivityPage({
  timeZone,
  scopeKey,
  viewerMembershipId,
}: {
  timeZone: string
  /** The signed-in membership; its own actions read "You". */
  viewerMembershipId: string
  /** Current user, Business and Store; a change remounts every read. */
  scopeKey: string
}) {
  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-5 pt-6 pb-10">
        <ActivityViewerProvider membershipId={viewerMembershipId}>
          <ActivityPageBody key={scopeKey} timeZone={timeZone} />
        </ActivityViewerProvider>
      </div>
    </ScrollableContent>
  )
}

const NO_NAMES: ReadonlyMap<string, string> = new Map()

function ActivityPageBody({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const { filter, hasFilters, setFilter } = useActivityFilterParams()
  const { open } = useActivityParams()
  const [now, setNow] = useState(() => new Date())
  // Each mount (and each Refresh) owns its cache entries, so no request or
  // result from an earlier scope or list can render here, even briefly.
  const [mount, setMount] = useState(nextReadMount)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [personNames, setPersonNames] =
    useState<ReadonlyMap<string, string>>(NO_NAMES)
  const filters = useQuery(
    mountOwnedRead(trpc.activity.filters.queryOptions({}, freshRead), mount),
  )
  const list = useInfiniteQuery(
    mountOwnedRead(
      trpc.activity.listPage.infiniteQueryOptions(
        getActivityListPageInput(filter, timeZone, now),
        {
          ...freshRead,
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        },
      ),
      mount,
    ),
  )
  // One known access/cursor refusal on either read hides everything read
  // under the earlier access: rows, counts, choices, scope and picked names.
  const drift =
    (list.isError && isAccessDrift(list.error)) ||
    (filters.isError && isAccessDrift(filters.error))
  const options = !drift && filters.isSuccess ? filters.data : undefined
  // A fresh first page and fresh choices under current access.
  const restart = () => {
    setNow(new Date())
    setPersonNames(NO_NAMES)
    setMount(nextReadMount())
  }

  return (
    <>
      <ActivityHeader
        scope={options?.scope ?? null}
        refreshing={filters.isFetching || list.isFetching}
        onRefresh={restart}
      />
      <ActivitySearchFilter
        filter={filter}
        setFilter={setFilter}
        options={options}
        optionsError={!drift && filters.isError}
        onRetryOptions={() => void filters.refetch()}
        now={now}
        personNames={drift ? NO_NAMES : personNames}
        onSearchPeople={() => setPickerOpen(true)}
      />
      <ActivityPersonPicker
        open={pickerOpen && !drift}
        onOpenChange={setPickerOpen}
        onPick={(actor) => {
          setPersonNames((current) =>
            new Map(current).set(actor.membershipId, actor.name),
          )
          setPickerOpen(false)
          void setFilter({ person: actor.membershipId })
        }}
      />
      {drift ? (
        <div
          role="alert"
          className="flex min-h-56 flex-col items-center justify-center gap-3 border border-dashed text-center"
        >
          <p className="font-medium">Your access has changed</p>
          <p className="text-sm text-muted-foreground">
            Activity shown earlier was cleared. Reload to see what you can
            access now.
          </p>
          <Button variant="outline" onClick={restart}>
            Reload activity
          </Button>
        </div>
      ) : list.isPending ? (
        <ActivityFeedSkeleton />
      ) : list.isError && !list.isFetchNextPageError ? (
        <div
          role="alert"
          className="flex min-h-56 flex-col items-center justify-center gap-3 border border-dashed text-center"
        >
          <p className="font-medium">Activity couldn't load</p>
          <p className="text-sm text-muted-foreground">
            It may not be available with your current access. Your filters are
            kept.
          </p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ActivityList
          pages={list.data?.pages ?? []}
          timeZone={timeZone}
          now={now}
          filtered={hasFilters}
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
          nextPageError={list.isFetchNextPageError}
          onLoadMore={() => void list.fetchNextPage()}
          onClearFilters={() => void setFilter(null)}
          onOpen={(key) => void open(key)}
          showStore={showActivityStore(
            options ? options.stores.length : null,
            filter.storeIds.length,
          )}
        />
      )}
    </>
  )
}

function ActivityList({
  pages,
  timeZone,
  now,
  filtered,
  hasNextPage,
  isFetchingNextPage,
  nextPageError,
  onLoadMore,
  onClearFilters,
  onOpen,
  showStore,
}: {
  pages: BusinessActivityPage[]
  timeZone: string
  now: Date
  filtered: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  nextPageError: boolean
  onLoadMore: () => void
  onClearFilters: () => void
  onOpen: (key: string) => void
  showStore: boolean
}) {
  const items = pages.flatMap((page) => page.items)
  const first = pages[0]
  const total = first?.total ?? null
  return (
    <section aria-label="Recorded activity">
      <p aria-live="polite" className="text-[13px] text-muted-foreground">
        {total === null
          ? `${items.length} ${items.length === 1 ? "event" : "events"} shown`
          : `${total} ${total === 1 ? "event" : "events"}`}
      </p>
      <ActivityFeed
        items={items}
        timeZone={timeZone}
        now={now}
        filtered={filtered}
        coverage={first?.coverage ?? null}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        nextPageError={nextPageError}
        onLoadMore={onLoadMore}
        onClearFilters={onClearFilters}
        onOpen={(event) => onOpen(event.key)}
        showStore={showStore}
      />
    </section>
  )
}
