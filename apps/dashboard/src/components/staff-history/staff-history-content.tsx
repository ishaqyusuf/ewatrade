import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { StaffHistoryEvent } from "./staff-history-event"

export function StaffHistoryContent({
  page,
  showSubject,
}: {
  page: RouterOutputs["retailOps"]["staffHistoryPage"]
  showSubject: boolean
}) {
  return (
    <div className="grid gap-5">
      {page.total === null ? (
        <p className="text-sm text-muted-foreground">
          Some older changes couldn’t be loaded.
        </p>
      ) : null}
      {page.data.length ? (
        page.data.map((event) => (
          <StaffHistoryEvent
            key={`${event.stream}:${event.id}`}
            event={event}
            showSubject={showSubject}
          />
        ))
      ) : (
        <p>No changes yet.</p>
      )}
    </div>
  )
}
