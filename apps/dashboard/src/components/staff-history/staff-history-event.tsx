import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { StaffHistorySnapshot } from "./staff-history-snapshot"
type Event = RouterOutputs["retailOps"]["staffHistoryPage"]["data"][number]

export function StaffHistoryEvent({ event }: { event: Event }) {
  return (
    <article className="grid gap-4 border-b pb-6 text-sm">
      <div className="grid gap-1">
        <h3 className="font-medium">
          {event.eventType.toLowerCase().replaceAll("_", " ")}
        </h3>
        <p>
          {event.subject.name ?? "Subject unavailable"}
          {event.subject.email ? ` · ${event.subject.email}` : ""}
        </p>
        <p className="text-muted-foreground">
          Actor: {event.actor.name ?? "Unavailable"}
          {event.actor.email ? ` · ${event.actor.email}` : ""}
        </p>
        {event.subject.coverage === "historical_profile" ||
        event.actor.coverage === "historical_profile" ? (
          <p className="text-muted-foreground">
            Identity from a saved historical profile.
          </p>
        ) : null}
        <time dateTime={event.at}>
          {new Date(event.at).toISOString()} (UTC)
        </time>
        <p className="text-xs text-muted-foreground">
          {event.stream === "LIFECYCLE"
            ? "Business membership"
            : "Recorded Store access"}{" "}
          · {event.source}
        </p>
        {"revision" in event ? (
          <p className="text-xs text-muted-foreground">
            Saved access revision {event.revision}
          </p>
        ) : null}
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
                  <dd>{event[side].role ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd>{event[side].status ?? "Not recorded"}</dd>
                </div>
              </dl>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
