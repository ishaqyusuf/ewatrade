import {
  createMarketingEarlyAccessAdminEmail,
  createMarketingEarlyAccessConfirmationEmail,
  createMarketingWaitlistAdminEmail,
  createMarketingWaitlistConfirmationEmail,
  defaultMarketingEarlyAccessAdminSubject,
  defaultMarketingEarlyAccessConfirmationSubject,
  defaultMarketingWaitlistAdminSubject,
  defaultMarketingWaitlistConfirmationSubject,
  dispatchEmailMessages,
  type EmailMessage,
  type MarketingEmailInput,
  type EmailTransport
} from "@ewatrade/email"

import type { NotificationContact } from "../contacts"
import type { NotificationChannelDispatch } from "../delivery"

function getEmailFrom() {
  return process.env.EMAIL_FROM ?? "noreply@ewatrade.local"
}

function getEmailReplyTo() {
  return process.env.EMAIL_REPLY_TO
}

function isEmailRecipient(recipient: NotificationContact): recipient is Extract<
  NotificationContact,
  { kind: "email" }
> {
  return recipient.kind === "email"
}

function buildEmailMessagesForDispatch(dispatch: NotificationChannelDispatch): EmailMessage[] {
  const from = getEmailFrom()
  const replyTo = getEmailReplyTo()
  const emailRecipients = dispatch.recipients.filter(isEmailRecipient)

  switch (dispatch.notificationType) {
    case "marketing_early_access_requested": {
      const payload = {
        ...(dispatch.payload as Omit<MarketingEmailInput, "type">),
        type: "EARLY_ACCESS"
      } satisfies MarketingEmailInput

      return emailRecipients.map((recipient) =>
        recipient.deliveryRole === "customer"
          ? createMarketingEarlyAccessConfirmationEmail({
              from,
              input: payload,
              replyTo,
              subject: defaultMarketingEarlyAccessConfirmationSubject(),
              to: recipient.email
            })
          : createMarketingEarlyAccessAdminEmail({
              from,
              input: payload,
              replyTo,
              subject: defaultMarketingEarlyAccessAdminSubject(),
              to: recipient.email
            })
      )
    }
    case "marketing_waitlist_joined": {
      const payload = {
        ...(dispatch.payload as Omit<MarketingEmailInput, "type">),
        type: "WAITLIST"
      } satisfies MarketingEmailInput

      return emailRecipients.map((recipient) =>
        recipient.deliveryRole === "customer"
          ? createMarketingWaitlistConfirmationEmail({
              from,
              input: payload,
              replyTo,
              subject: defaultMarketingWaitlistConfirmationSubject(),
              to: recipient.email
            })
          : createMarketingWaitlistAdminEmail({
              from,
              input: payload,
              replyTo,
              subject: defaultMarketingWaitlistAdminSubject(),
              to: recipient.email
            })
      )
    }
    default:
      throw new Error(`Unsupported email notification type: ${dispatch.notificationType}`)
  }
}

export class EmailService {
  async sendBulk(dispatches: NotificationChannelDispatch[], transport?: EmailTransport) {
    const emailDispatches = dispatches.filter((dispatch) => dispatch.channel === "email")

    if (!emailDispatches.length) {
      return {
        failed: 0,
        sent: 0,
        skipped: dispatches.length
      }
    }

    let sent = 0
    let failed = 0

    for (const dispatch of emailDispatches) {
      try {
        const messages = buildEmailMessagesForDispatch(dispatch)

        if (!messages.length) {
          continue
        }

        await dispatchEmailMessages(messages, transport)
        sent += messages.length
      } catch {
        failed += 1
      }
    }

    return {
      failed,
      sent,
      skipped: dispatches.length - emailDispatches.length
    }
  }
}
