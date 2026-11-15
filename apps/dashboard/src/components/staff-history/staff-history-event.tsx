import { getStaffRoleLabel, getStaffStatusLabel } from "@/lib/staff-management"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { StaffHistorySnapshot } from "./staff-history-snapshot"
type Event = RouterOutputs["retailOps"]["staffHistoryPage"]["data"][number]

const eventTitles: Record<string, string> = {
  INVITED: "Invited",
  INVITE_REFRESHED: "Invite sent again",
  INVITE_RESENT: "Invite sent again",
  INVITE_REVOKED: "Invite cancelled",
  ACCEPTED: "Joined",
  ONBOARDING_COMPLETED: "Joined",
  SUSPENDED: "Suspended",
  REACTIVATED: "Reactivated",
  REMOVED: "Removed",
  ROLE_CHANGED: "Role changed",
  STORE_ACCESS_CONFIRMED: "Access changed",
  STORE_ACCESS_CHANGED: "Access changed",
  OTHER_STORE_ACCESS_CHANGE: "Access changed",
}

/** An event type in plain sentence case. */
export function staffHistoryEventTitle(eventType: string) {
  const known = eventTitles[eventType]
  if (known) return known
  const text = eventType.toLowerCase().replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
})

function change(label: string, before: string | null, after: string | null) {
  if (!after || before === after) return null
  return before ? `${label}: ${before} → ${after}` : `${label}: ${after}`
}

/** One change: what happened, when and by whom, then what changed. */
export function StaffHistoryEvent({
  event,
  showSubject,
}: {
  event: Event
  /** Off when the sheet shows one person's history. */
  showSubject: boolean
}) {
  const lines =
    event.stream === "STORE_ACCESS"
      ? []
      : [
          change(
            "Role",
            event.before.role ? getStaffRoleLabel(event.before.role) : null,
            event.after.role ? getStaffRoleLabel(event.after.role) : null,
          ),
          change(
            "Status",
            event.before.status
              ? getStaffStatusLabel(event.before.status)
              : null,
            event.after.status ? getStaffStatusLabel(event.after.status) : null,
          ),
        ].filter((line): line is string => Boolean(line))
  return (
    <article className="grid gap-3 border-b border-border pb-5 text-base">
      <div className="grid gap-0.5">
        <h3 className="font-medium">
          {staffHistoryEventTitle(event.eventType)}
        </h3>
        {showSubject ? (
          <p>{event.subject.name ?? "A former staff member"}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          <time dateTime={event.at}>{when.format(new Date(event.at))}</time>
          {event.actor.name ? ` · by ${event.actor.name}` : ""}
        </p>
        {"reason" in event && event.reason ? (
          <p className="text-sm">Reason: {event.reason}</p>
        ) : null}
      </div>
      {event.stream === "STORE_ACCESS" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["before", "after"] as const).map((side) => (
            <section key={side} className="min-w-0 break-words">
              <h4 className="mb-1 text-sm text-muted-foreground">
                {side === "before" ? "Before" : "After"}
              </h4>
              <StaffHistorySnapshot value={event[side]} />
            </section>
          ))}
        </div>
      ) : lines.length ? (
        <ul className="grid gap-0.5 text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
