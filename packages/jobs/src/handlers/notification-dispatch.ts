import type { Prisma } from "@ewatrade/db"
import { prisma } from "@ewatrade/db/client"
import { recordRetailOpsSharedLinkNotificationDispatch } from "@ewatrade/db/queries"
import {
  type MarketingEarlyAccessRequestedPayload,
  type MarketingWaitlistJoinedPayload,
  type RetailOpsSharedLinkOrderRequestedPayload,
  type RetailOpsStaffInvitedPayload,
  createMarketingEarlyAccessDispatch,
  createMarketingWaitlistDispatch,
  createRetailOpsSharedLinkOrderDispatch,
  createRetailOpsStaffInviteDispatch,
  planNotificationDeliveries,
} from "@ewatrade/notifications"
import {
  EmailService,
  type EmailServiceDeliveryResult,
} from "@ewatrade/notifications/services/email-service"

export type NotificationDispatchDeliveryOptions = {
  baseDelayMs?: number
  maxAttempts?: number
}

export type NotificationDispatchPayload = (
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
  deliveries: EmailServiceDeliveryResult[],
) {
  return deliveries
    .filter(
      (delivery) =>
        delivery.notificationType === "retail_ops_shared_link_order_requested",
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
      subject: delivery.subject,
    }))
}

function toMarketingLeadDeliveryReceipts(
  deliveries: EmailServiceDeliveryResult[],
) {
  return deliveries
    .filter((delivery) =>
      [
        "marketing_early_access_requested",
        "marketing_waitlist_joined",
      ].includes(delivery.notificationType),
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
      subject: delivery.subject,
    }))
}

function toObjectMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return { ...(value as Record<string, unknown>) }
}

function toJsonArray(value: unknown): Prisma.InputJsonValue[] {
  return Array.isArray(value)
    ? (value.filter((entry) => entry !== undefined) as Prisma.InputJsonValue[])
    : []
}

async function recordMarketingLeadDeliveryResult(input: {
  dispatch: NotificationDispatchPayload
  failed: number
  receipts: ReturnType<typeof toMarketingLeadDeliveryReceipts>
  sent: number
  skipped: number
}) {
  if (
    input.dispatch.type !== "marketing_early_access_requested" &&
    input.dispatch.type !== "marketing_waitlist_joined"
  ) {
    return
  }

  const lead = await prisma.leadCapture.findUnique({
    where: { id: input.dispatch.payload.id },
    select: { metadata: true },
  })

  if (!lead) return

  const metadata = toObjectMetadata(lead.metadata) as Prisma.InputJsonObject
  const previousDispatches = toJsonArray(metadata.notificationDispatches)
  const status = input.failed > 0 ? "failed" : "sent"
  const nextDispatch = {
    failed: input.failed,
    notificationType: input.dispatch.type,
    providerStatuses: input.receipts.map((receipt) => receipt.status),
    receipts: input.receipts,
    recordedAt: new Date().toISOString(),
    sent: input.sent,
    skipped: input.skipped,
    status,
  } satisfies Prisma.InputJsonObject
  const nextDispatches = [...previousDispatches, nextDispatch].slice(-10)
  const latestDispatch = nextDispatches[nextDispatches.length - 1] ?? null

  await prisma.leadCapture.update({
    data: {
      metadata: {
        ...metadata,
        lastNotificationDispatch: latestDispatch,
        notificationDispatches: nextDispatches,
      } satisfies Prisma.InputJsonValue,
    },
    where: { id: input.dispatch.payload.id },
  })
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
    status,
  })
}

export async function notificationDispatchHandler(
  input: NotificationDispatchPayload,
  attempt: number,
) {
  const dispatch = createDispatchForNotification(input)
  const deliveryPlan = planNotificationDeliveries(dispatch)
  const emailService = new EmailService()
  const result = await emailService.sendBulk(deliveryPlan.dispatches)
  const marketingReceipts = toMarketingLeadDeliveryReceipts(result.deliveries)
  const receipts = toSharedLinkDeliveryReceipts(result.deliveries)

  await recordMarketingLeadDeliveryResult({
    dispatch: input,
    failed: result.failed,
    receipts: marketingReceipts,
    sent: result.sent,
    skipped: result.skipped,
  })

  await recordSharedLinkOrderDeliveryResult({
    attempt,
    dispatch: input,
    failed: result.failed,
    receipts,
    sent: result.sent,
  })

  if (
    input.type === "retail_ops_shared_link_order_requested" &&
    result.failed > 0 &&
    result.sent === 0
  ) {
    throw new Error(
      "All shared-link notification email deliveries failed for this attempt.",
    )
  }
}
