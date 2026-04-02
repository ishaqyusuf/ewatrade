import { dispatchEmailMessages } from "@ewatrade/email"
import {
  createMarketingLeadEmailMessages,
  type LeadNotificationPayload
} from "@ewatrade/notifications"

export type NotificationDispatchPayload = {
  type: "marketing.lead.captured"
  payload: LeadNotificationPayload
}

export async function notificationDispatchHandler(
  input: NotificationDispatchPayload
) {
  if (input.type !== "marketing.lead.captured") {
    return
  }

  const { adminMessages, confirmationMessage } = createMarketingLeadEmailMessages(
    input.payload
  )

  await dispatchEmailMessages([...adminMessages, confirmationMessage])
}
