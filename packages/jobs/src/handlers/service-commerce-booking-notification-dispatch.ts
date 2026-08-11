import { resolveCommunicationsRecipient } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimServiceCommerceBookingNotificationIntent,
  completeServiceCommerceBookingNotificationIntent,
  failServiceCommerceBookingNotificationIntent,
} from "@ewatrade/db/queries"
import { CustomerMessagingService } from "@ewatrade/notifications/services/customer-messaging-service"

/**
 * Deliberately identifier-only: a worker reloads and authorizes the intent at
 * execution time instead of carrying customer data or booking state in a job.
 */
export type ServiceCommerceBookingNotificationDispatchPayload = {
  actorUserId: string
  intentId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimServiceCommerceBookingNotificationIntent>>
>

type Dependencies = {
  claim(
    input: ServiceCommerceBookingNotificationDispatchPayload,
  ): Promise<Claim | null>
  complete(
    input: ServiceCommerceBookingNotificationDispatchPayload,
  ): Promise<unknown>
  fail(
    input: ServiceCommerceBookingNotificationDispatchPayload & {
      failureCode: string
      retryAt?: Date
    },
  ): Promise<unknown>
  messaging: Pick<CustomerMessagingService, "send">
  resolveRecipient(reference: string): string
}

const MAX_DELIVERY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 60_000

function neutralMessage(type: string) {
  switch (type) {
    case "confirmation":
      return "Your booking has been confirmed."
    case "reminder":
      return "Reminder: you have an upcoming booking."
    case "reschedule":
      return "Your booking schedule has changed."
    case "cancellation":
      return "Your booking has been cancelled."
    default:
      return "There is an update to your booking."
  }
}

function retryAt(attempt: number, now = Date.now()) {
  return new Date(now + RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1))
}

function defaultDependencies(): Dependencies {
  return {
    claim: (input) =>
      claimServiceCommerceBookingNotificationIntent(prisma, input),
    complete: (input) =>
      completeServiceCommerceBookingNotificationIntent(prisma, input),
    fail: (input) =>
      failServiceCommerceBookingNotificationIntent(prisma, input),
    messaging: new CustomerMessagingService(),
    resolveRecipient: resolveCommunicationsRecipient,
  }
}

export async function runServiceCommerceBookingNotificationDispatch(
  payload: ServiceCommerceBookingNotificationDispatchPayload,
  attempt = 1,
  dependencies: Dependencies = defaultDependencies(),
) {
  // `claim` rechecks membership and the booking notification policy at job time.
  const claim = await dependencies.claim(payload)
  if (!claim) return null

  if (claim.channel !== "sms" && claim.channel !== "whatsapp") {
    await dependencies.fail({
      ...payload,
      failureCode: "unsupported_notification_channel",
    })
    return null
  }

  try {
    const delivery = await dependencies.messaging.send({
      channel: claim.channel,
      intentId: claim.intentId,
      message: neutralMessage(claim.type),
      // Recipient ciphertext is decrypted only after the scoped claim succeeds.
      to: dependencies.resolveRecipient(claim.recipientCiphertext),
    })
    await dependencies.complete(payload)
    return delivery
  } catch (error) {
    const retryable = attempt < MAX_DELIVERY_ATTEMPTS
    await dependencies.fail({
      ...payload,
      failureCode: "provider_delivery_failed",
      ...(retryable ? { retryAt: retryAt(attempt) } : {}),
    })
    if (retryable) throw error
    return null
  }
}

export async function serviceCommerceBookingNotificationDispatchHandler(
  payload: ServiceCommerceBookingNotificationDispatchPayload,
  attempt: number,
) {
  await runServiceCommerceBookingNotificationDispatch(payload, attempt)
}
