import { prisma } from "@ewatrade/db/client"
import {
  claimProductAnalyticsEvent,
  pendingProductAnalyticsEvents,
  settleProductAnalyticsEvent,
} from "@ewatrade/db/product-analytics"
import { deliverDashboardOutcome } from "@ewatrade/events/server-dashboard"
import { dispatchProductAnalyticsEvent } from "../product-analytics-delivery"

export async function productAnalyticsDispatchHandler({
  eventId,
}: { eventId: string }) {
  await dispatchProductAnalyticsEvent(
    eventId,
    process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED === "true",
    {
      claim: (id) => claimProductAnalyticsEvent(prisma, id),
      deliver: deliverDashboardOutcome,
      erase: (id, leaseToken) =>
        prisma.productAnalyticsEvent.deleteMany({ where: { id, leaseToken } }),
      settle: (input) => settleProductAnalyticsEvent(prisma, input),
    },
  )
}

export async function productAnalyticsRecoveryHandler() {
  if (process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED !== "true")
    return { scanned: 0, failed: 0 }
  const events = await pendingProductAnalyticsEvents(prisma)
  const results: PromiseSettledResult<void>[] = []
  for (let offset = 0; offset < events.length; offset += 5) {
    results.push(
      ...(await Promise.allSettled(
        events
          .slice(offset, offset + 5)
          .map((event) =>
            productAnalyticsDispatchHandler({ eventId: event.id }),
          ),
      )),
    )
  }
  return {
    scanned: events.length,
    failed: results.filter((result) => result.status === "rejected").length,
  }
}
