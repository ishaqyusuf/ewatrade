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
            ? `At least ${page.knownMatchingEvents} ${page.knownMatchingEvents === 1 ? "change" : "changes"}`
            : `${page.total} ${page.total === 1 ? "change" : "changes"}`}
        </p>
        {page.total === null ? (
          <output>Some older changes couldn’t be loaded.</output>
        ) : null}
      </div>
      {page.data.length ? (
        page.data.map((event) => (
          <StaffHistoryEvent
            key={`${event.stream}:${event.id}`}
            event={event}
          />
        ))
      ) : (
        <p>No changes yet.</p>
      )}
    </div>
  )
}
