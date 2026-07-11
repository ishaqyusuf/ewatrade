import { prisma } from "@ewatrade/db/client"
import {
  recordRetailOpsSharedLinkNotificationDispatch,
} from "@ewatrade/db/queries"
import {
  EmailService,
  type EmailServiceDeliveryResult,
  type MarketingEarlyAccessRequestedPayload,
  type MarketingWaitlistJoinedPayload,
  type RetailOpsSharedLinkOrderRequestedPayload,
  type RetailOpsStaffInvitedPayload,
  createMarketingEarlyAccessDispatch,
  createMarketingWaitlistDispatch,
  createRetailOpsSharedLinkOrderDispatch,
  createRetailOpsStaffInviteDispatch,
  planNotificationDeliveries
} from "@ewatrade/notifications"

export type NotificationDispatchDeliveryOptions = {
  baseDelayMs?: number
  maxAttempts?: number
}

export type NotificationDispatchPayload =
  (
    | {
        type: "marketing_early_access_requested"
        payload: MarketingEarlyAccessRequestedPayload
      }
    | {
        type: "marketing_waitlist_joined"
        payload: MarketingWaitlistJoinedPayload
      }
    | {
        type: "retail_ops_shared_link_order_requested"
        payload: RetailOpsSharedLinkOrderRequestedPayload
      }
    | {
        type: "retail_ops_staff_invited"
        payload: RetailOpsStaffInvitedPayload
      }
  ) & {
    delivery?: NotificationDispatchDeliveryOptions
  }

function createDispatchForNotification(input: NotificationDispatchPayload) {
  switch (input.type) {
    case "marketing_early_access_requested":
      return createMarketingEarlyAccessDispatch(input.payload)
    case "marketing_waitlist_joined":
      return createMarketingWaitlistDispatch(input.payload)
    case "retail_ops_shared_link_order_requested":
      return createRetailOpsSharedLinkOrderDispatch(input.payload)
    case "retail_ops_staff_invited":
      return createRetailOpsStaffInviteDispatch(input.payload)
  }
}

function getMaxAttempts(input: NotificationDispatchPayload) {
  return input.delivery?.maxAttempts ?? 4
}

function getNextRetryAt(input: NotificationDispatchPayload, attempt: number) {
  if (attempt >= getMaxAttempts(input)) return null

  const baseDelayMs = input.delivery?.baseDelayMs ?? 2_000

  return new Date(Date.now() + baseDelayMs * 2 ** (attempt - 1))
}

function toSharedLinkDeliveryReceipts(
  deliveries: EmailServiceDeliveryResult[]
) {
  return deliveries
    .filter(
      (delivery) =>
        delivery.notificationType === "retail_ops_shared_link_order_requested"
    )
    .map((delivery) => ({
      deliveryRole: delivery.deliveryRole,
      error: delivery.error ?? null,
      failedAt: delivery.failedAt ?? null,
      provider: delivery.provider ?? null,
      providerMessageId: delivery.providerMessageId ?? null,
      recipientEmail: delivery.recipientEmail,
      sentAt: delivery.sentAt ?? null,
      status: delivery.status,
      subject: delivery.subject
    }))
}

async function recordSharedLinkOrderDeliveryResult(input: {
  attempt: number
  dispatch: NotificationDispatchPayload
  failed: number
  receipts: ReturnType<typeof toSharedLinkDeliveryReceipts>
  sent: number
}) {
  if (input.dispatch.type !== "retail_ops_shared_link_order_requested") return

  const status = input.failed > 0 ? "failed" : "sent"
  const nextRetryAt =
    input.failed > 0 && input.sent === 0
      ? getNextRetryAt(input.dispatch, input.attempt)
      : null

  await recordRetailOpsSharedLinkNotificationDispatch(prisma, {
    attempt: input.attempt,
    attemptedAt: new Date(),
    deliveries: input.receipts,
    failureReason:
      status === "failed"
        ? "One or more shared-link notification emails failed to send."
        : undefined,
    maxAttempts: getMaxAttempts(input.dispatch),
    nextRetryAt,
    notification: input.dispatch.payload,
    orderId: input.dispatch.payload.orderId,
    status
  })
}

export async function notificationDispatchHandler(
  input: NotificationDispatchPayload,
  attempt: number
) {
  const dispatch = createDispatchForNotification(input)
  const deliveryPlan = planNotificationDeliveries(dispatch)
  const emailService = new EmailService()
  const result = await emailService.sendBulk(deliveryPlan.dispatches)
  const receipts = toSharedLinkDeliveryReceipts(result.deliveries)

  await recordSharedLinkOrderDeliveryResult({
    attempt,
    dispatch: input,
    failed: result.failed,
    receipts,
    sent: result.sent
  })

  if (
    input.type === "retail_ops_shared_link_order_requested" &&
    result.failed > 0 &&
    result.sent === 0
  ) {
    throw new Error(
      "All shared-link notification email deliveries failed for this attempt."
    )
  }
}
