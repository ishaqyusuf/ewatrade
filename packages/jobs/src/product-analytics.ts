import { prisma } from "@ewatrade/db/client"
import { persistProductAnalyticsEvent } from "@ewatrade/db/product-analytics"
import { createDashboardOutcome } from "@ewatrade/events/server-dashboard"
import { productAnalyticsDispatchHandler } from "./handlers/product-analytics"
import { triggerJob } from "./trigger"

/** Optional analytics must never turn an already-committed business write into a failure. */
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
    await triggerJob(
      "analytics.dashboard.dispatch",
      productAnalyticsDispatchHandler,
      { eventId: envelope.eventId },
      { maxAttempts: 1 },
    ).catch(() => {})
  } catch {
    // No user inputs/errors in this diagnostic. Recovery handles already-persisted rows.
    console.warn("[analytics] dashboard outcome could not be queued")
  }
}
