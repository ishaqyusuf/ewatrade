import {
  createMarketingLeadAdminEmail,
  createMarketingLeadConfirmationEmail,
  type EmailMessage,
  type LeadCaptureEmailInput
} from "@ewatrade/email"

import { planNotificationDeliveries } from "./delivery"
import type { LeadNotificationPayload, NotificationDispatch, NotificationRecipient } from "./types"

export * from "./delivery"
export * from "./types"

function parseRecipientList(value: string | undefined) {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getMarketingNotificationRecipients() {
  const configured = parseRecipientList(process.env.MARKETING_INBOX_EMAILS)

  if (configured.length > 0) {
    return configured.map<NotificationRecipient>((email) => ({
      email,
      kind: "email"
    }))
  }

  if (!process.env.EMAIL_REPLY_TO) {
    return [] satisfies NotificationRecipient[]
  }

  return [
    {
      email: process.env.EMAIL_REPLY_TO,
      kind: "email"
    }
  ] satisfies NotificationRecipient[]
}

export function createMarketingLeadCapturedNotification(
  payload: LeadNotificationPayload
): NotificationDispatch<LeadNotificationPayload> {
  return {
    channels: ["email"],
    description:
      payload.type === "EARLY_ACCESS"
        ? "A merchant or operator requested early access from the marketing site."
        : "A visitor joined the marketing waitlist.",
    notificationType: "marketing.lead.captured",
    payload,
    recipients: getMarketingNotificationRecipients(),
    title:
      payload.type === "EARLY_ACCESS"
        ? "New early access request"
        : "New waitlist signup",
    variant: "info"
  }
}

export function createMarketingLeadEmailMessages(payload: LeadNotificationPayload) {
  const notification = createMarketingLeadCapturedNotification(payload)
  const deliveryPlan = planNotificationDeliveries(notification)
  const from = process.env.EMAIL_FROM ?? "noreply@ewatrade.local"
  const replyTo = process.env.EMAIL_REPLY_TO

  const adminMessages = deliveryPlan.dispatches
    .filter((dispatch) => dispatch.channel === "email")
    .flatMap((dispatch) =>
      dispatch.recipients.flatMap((recipient) =>
        recipient.email
          ? [
              createMarketingLeadAdminEmail({
                from,
                input: payload satisfies LeadCaptureEmailInput,
                replyTo,
                to: recipient.email
              })
            ]
          : []
      )
    )

  const confirmationMessage = createMarketingLeadConfirmationEmail({
    from,
    input: payload satisfies LeadCaptureEmailInput,
    replyTo
  })

  return {
    adminMessages,
    confirmationMessage,
    deliveryPlan
  } satisfies {
    adminMessages: EmailMessage[]
    confirmationMessage: EmailMessage
    deliveryPlan: ReturnType<typeof planNotificationDeliveries>
  }
}
