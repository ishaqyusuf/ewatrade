import { isQaAnalyticsPrincipal } from "@ewatrade/events/qa-policy-server"

type ClaimedEvent = {
  id: string
  leaseToken: string | null
  attempts: number
  envelope: unknown
  user: { email: string }
  tenant: { dataClassification: string; qaPurgeStartedAt: Date | null } | null
}
export type AnalyticsDeliveryDependencies = {
  claim(id: string): Promise<ClaimedEvent | null>
  deliver(envelope: unknown): Promise<void>
  erase(id: string, leaseToken: string): Promise<unknown>
  settle(input: {
    id: string
    leaseToken: string
    delivered: boolean
    attempts: number
  }): Promise<unknown>
}
/** Claims once, rechecks current QA authority, and always releases its own lease. */
export async function dispatchProductAnalyticsEvent(
  eventId: string,
  enabled: boolean,
  dependencies: AnalyticsDeliveryDependencies,
) {
  if (!enabled) return
  const event = await dependencies.claim(eventId)
  if (!event?.leaseToken) return
  let delivered = false
  try {
    if (
      event.tenant?.qaPurgeStartedAt ||
      isQaAnalyticsPrincipal({
        email: event.user.email,
        dataClassification: event.tenant?.dataClassification,
      })
    ) {
      await dependencies.erase(event.id, event.leaseToken)
      return
    }
    await dependencies.deliver(event.envelope)
    delivered = true
  } finally {
    await dependencies.settle({
      id: event.id,
      leaseToken: event.leaseToken,
      delivered,
      attempts: event.attempts,
    })
  }
}
