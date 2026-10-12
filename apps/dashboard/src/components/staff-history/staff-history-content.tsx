import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { StaffHistoryEvent } from "./staff-history-event"
export function StaffHistoryContent({
  page,
}: { page: RouterOutputs["retailOps"]["staffHistoryPage"] }) {
  return (
    <div className="grid gap-6 text-sm">
      <div className="grid gap-2">
        <p className="text-lg font-medium">
          {page.total === null
            ? `${page.knownMatchingEvents} known recorded events · full total unknown`
            : `${page.total} matching recorded events`}
        </p>
        <p className="text-muted-foreground">
          {page.data.length} on this page. Counts describe recorded events, not
          people.
        </p>
        <p className="text-muted-foreground">{page.coverage.detail}</p>
        {page.total === null ? (
          <p role="status">
            A requested history stream is unavailable. The full matching total
            is unknown.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          As of {new Date(page.asOf).toISOString()} (UTC)
        </p>
      </div>
      {page.data.length ? (
        page.data.map((event) => (
          <StaffHistoryEvent
            key={`${event.stream}:${event.id}`}
            event={event}
          />
        ))
      ) : (
        <p>No matching events in the available recorded streams.</p>
      )}
    </div>
  )
}
