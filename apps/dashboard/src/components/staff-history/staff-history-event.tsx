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

export function StaffHistoryEvent({ event }: { event: Event }) {
  return (
    <article className="grid gap-4 border-b pb-6 text-sm">
      <div className="grid gap-1">
        <h3 className="font-medium">
          {staffHistoryEventTitle(event.eventType)}
        </h3>
        <p>
          {event.subject.name ?? "A former staff member"}
          {event.subject.email ? ` · ${event.subject.email}` : ""}
        </p>
        {event.actor.name ? (
          <p className="text-muted-foreground">by {event.actor.name}</p>
        ) : null}
        <time dateTime={event.at} className="text-muted-foreground">
          {when.format(new Date(event.at))}
        </time>
        {"reason" in event && event.reason ? (
          <p>Reason: {event.reason}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-6">
        {(["before", "after"] as const).map((side) => (
          <section key={side} className="min-w-0 break-words">
            <h4 className="mb-2 font-medium">
              {side === "before" ? "Before" : "After"}
            </h4>
            {event.stream === "STORE_ACCESS" ? (
              <StaffHistorySnapshot value={event[side]} />
            ) : (
              <dl className="grid gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Role</dt>
                  <dd>
                    {event[side].role
                      ? getStaffRoleLabel(event[side].role)
                      : "Not saved"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd>
                    {event[side].status
                      ? getStaffStatusLabel(event[side].status)
                      : "Not saved"}
                  </dd>
                </div>
              </dl>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
