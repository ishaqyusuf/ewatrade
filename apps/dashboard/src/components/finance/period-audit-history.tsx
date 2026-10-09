"use client"

import { useTRPC } from "@/trpc/client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { FinancePeriodAuditView } from "./period-audit-view"

export function FinancePeriodAuditHistory({ bookId }: { bookId: string }) {
  const trpc = useTRPC()
  const query = useInfiniteQuery(
    trpc.finance.periodAudit.infiniteQueryOptions(
      { bookId, limit: 30 },
      { getNextPageParam: (page) => page.nextCursor ?? undefined },
    ),
  )
  const seen = new Set<string>()
  const events = (
    query.data?.pages.flatMap((page) => page.events) ?? []
  ).filter((event) => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
  return (
    <FinancePeriodAuditView
      scope={bookId}
      events={events}
      pending={query.isPending}
      error={query.isError ? query.error.message : null}
      fetching={query.isFetching}
      hasNextPage={query.hasNextPage}
      onLoadOlder={() => {
        if (query.hasNextPage && !query.isFetching) void query.fetchNextPage()
      }}
      onRefresh={() => {
        if (!query.isFetching) void query.refetch()
      }}
    />
  )
}
