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
    <section aria-labelledby={id} className="mt-3.5">
      <h2
        id={id}
        className="sticky top-0 z-[1] flex items-baseline gap-2.5 border-b bg-background pt-2.5 pb-2 text-[13px] font-medium"
      >
        <span>{group.title}</span>
        {group.subtitle ? (
          <span className="font-normal text-muted-foreground">
            {group.subtitle}
          </span>
        ) : null}
      </h2>
      <ul>
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
