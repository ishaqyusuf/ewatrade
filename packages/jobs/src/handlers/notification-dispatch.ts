import type { Prisma } from "@ewatrade/db"
import { prisma } from "@ewatrade/db/client"
import {
  type MarketingEarlyAccessRequestedPayload,
  type MarketingWaitlistJoinedPayload,
  type RetailOpsStaffInvitedPayload,
  createMarketingEarlyAccessDispatch,
  createMarketingWaitlistDispatch,
  createRetailOpsStaffInviteDispatch,
  planNotificationDeliveries,
} from "@ewatrade/notifications"
import {
  EmailService,
  type EmailServiceDeliveryResult,
} from "@ewatrade/notifications/services/email-service"

export type NotificationDispatchPayload =
  | {
      type: "marketing_early_access_requested"
      payload: MarketingEarlyAccessRequestedPayload
    }
  | {
      type: "marketing_waitlist_joined"
      payload: MarketingWaitlistJoinedPayload
    }
  | {
      type: "retail_ops_staff_invited"
      payload: RetailOpsStaffInvitedPayload
    }

function createDispatchForNotification(input: NotificationDispatchPayload) {
  switch (input.type) {
    case "marketing_early_access_requested":
      return createMarketingEarlyAccessDispatch(input.payload)
    case "marketing_waitlist_joined":
      return createMarketingWaitlistDispatch(input.payload)
    case "retail_ops_staff_invited":
      return createRetailOpsStaffInviteDispatch(input.payload)
  }
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
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
  const nextDispatch = {
    failed: input.failed,
    notificationType: input.dispatch.type,
    providerStatuses: input.receipts.map((receipt) => receipt.status),
    receipts: input.receipts,
    recordedAt: new Date().toISOString(),
    sent: input.sent,
    skipped: input.skipped,
    status: input.failed > 0 ? "failed" : "sent",
  } satisfies Prisma.InputJsonObject
  const nextDispatches = [...previousDispatches, nextDispatch].slice(-10)

  await prisma.leadCapture.update({
    data: {
      metadata: {
        ...metadata,
        lastNotificationDispatch:
          nextDispatches[nextDispatches.length - 1] ?? null,
        notificationDispatches: nextDispatches,
      } satisfies Prisma.InputJsonValue,
    },
    where: { id: input.dispatch.payload.id },
  })
}

export async function notificationDispatchHandler(
  input: NotificationDispatchPayload,
  _attempt: number,
) {
  const dispatch = createDispatchForNotification(input)
  const deliveryPlan = planNotificationDeliveries(dispatch)
  const result = await new EmailService().sendBulk(deliveryPlan.dispatches)

  await recordMarketingLeadDeliveryResult({
    dispatch: input,
    failed: result.failed,
    receipts: toMarketingLeadDeliveryReceipts(result.deliveries),
    sent: result.sent,
    skipped: result.skipped,
  })
}
