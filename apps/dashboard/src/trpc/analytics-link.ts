import {
  dashboardProcedure,
  workflowEvent,
  workflowFailure,
} from "@ewatrade/events/dashboard-workflows"
import type { EventMetadata } from "@ewatrade/events/metadata"
import type { TRPCLink } from "@trpc/client"
import type { AnyTRPCRouter } from "@trpc/server"
import { observable } from "@trpc/server/observable"

/** Attempts/failures belong to the browser; successful mutations belong to the API. */
export function dashboardAnalyticsLink<TRouter extends AnyTRPCRouter>(
  track: (name: string, metadata?: EventMetadata) => void,
): TRPCLink<TRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) => {
        const workflow =
          op.type === "mutation" ? dashboardProcedure(op.path) : null
        const started = performance.now()
        const capture = (phase: "started" | "failed" | "blocked") => {
          if (!workflow) return
          const event = workflowEvent(workflow, phase)
          try {
            track(event.name, {
              ...event.properties,
              channel: "browser",
              ...(phase === "started"
                ? {}
                : { duration_ms: Math.max(0, performance.now() - started) }),
            })
          } catch {
            /* Optional analytics cannot interrupt the operation. */
          }
        }
        capture("started")
        const subscription = next(op).subscribe({
          next: (result) => observer.next(result),
          error: (error) => {
            capture(workflowFailure(error.data?.code))
            observer.error(error)
          },
          complete: () => observer.complete(),
        })
        return () => subscription.unsubscribe()
      })
}
