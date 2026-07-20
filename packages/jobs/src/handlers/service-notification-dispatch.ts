import { prisma } from "@ewatrade/db/client"
import {
  getServiceNotificationIntentForDelivery,
  recordServiceDeliveryAttempt,
} from "@ewatrade/db/queries"
import { CustomerMessagingService } from "@ewatrade/notifications/services/customer-messaging-service"

export type ServiceNotificationDispatchPayload = { intentId: string }

export async function serviceNotificationDispatchHandler(
  input: ServiceNotificationDispatchPayload,
  _attempt: number,
) {
  const intent = await getServiceNotificationIntentForDelivery(prisma, input)
  if (!intent) return
  if (!intent.customerPhone) {
    throw new Error("Service notification has no customer phone number.")
  }
  try {
    const result = await new CustomerMessagingService().send({
      channel: intent.channel,
      intentId: intent.id,
      message: intent.message,
      to: intent.customerPhone,
    })
    await recordServiceDeliveryAttempt(prisma, {
      channel: intent.channel,
      intentId: intent.id,
      providerAttemptId: result.providerAttemptId,
      providerKey: result.providerKey,
      status: result.status,
      tenantId: intent.tenantId,
    })
    return
  } catch (error) {
    await recordServiceDeliveryAttempt(prisma, {
      channel: intent.channel,
      failureCode: "PROVIDER_SEND_FAILED",
      failureMessage:
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      intentId: intent.id,
      providerKey:
        intent.channel === "whatsapp"
          ? "service_whatsapp_webhook"
          : "service_sms_webhook",
      status: "failed",
      tenantId: intent.tenantId,
    })
    throw error
  }
}
