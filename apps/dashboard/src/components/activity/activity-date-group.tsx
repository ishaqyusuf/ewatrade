import type { BusinessActivityView } from "@ewatrade/notifications/business-events"
import type { ActivityDayGroup } from "./activity-format"
import { ActivityRow } from "./activity-row"

export function ActivityDateGroup({
  group,
  timeZone,
  showStore,
  onOpen,
}: {
  group: ActivityDayGroup
  timeZone: string
  showStore: boolean
  onOpen: (event: BusinessActivityView, trigger: HTMLButtonElement) => void
}) {
  const id = `activity-day-${group.day}`
  return (
    <section
      aria-labelledby={id}
      className="mt-4 overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      <h2
        id={id}
        className="flex items-baseline gap-2.5 border-b border-border px-4 py-3 text-sm font-semibold"
      >
        <span>{group.title}</span>
        {group.subtitle ? (
          <span className="font-normal text-muted-foreground">
            {group.subtitle}
          </span>
        ) : null}
      </h2>
      <ul className="grid gap-0.5 p-1.5">
        {group.items.map((event) => (
          <ActivityRow
            key={event.key}
            event={event}
            timeZone={timeZone}
            showStore={showStore}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  )
}
