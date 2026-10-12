import { prisma } from "@ewatrade/db/client"
import { persistProductAnalyticsEvent } from "@ewatrade/db/product-analytics"
import { createDashboardOutcome } from "@ewatrade/events/server-dashboard"

/**
 * Optional analytics must never turn an already-committed business write into
 * a failure. The envelope is only persisted: the 15-minute
 * `analytics.dashboard.recovery` sweep delivers pending events in batches, so
 * a dashboard write never costs a Trigger.dev run of its own.
 */
export async function recordDashboardOutcome(
  input: Parameters<typeof createDashboardOutcome>[0],
) {
  try {
    const envelope = createDashboardOutcome(input)
    if (!envelope) return
    await persistProductAnalyticsEvent(prisma, {
      id: envelope.eventId,
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      envelope,
    })
  } catch {
    // No user inputs/errors in this diagnostic.
    console.warn("[analytics] dashboard outcome could not be recorded")
  }
}
