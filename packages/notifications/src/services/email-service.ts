import {
  type EmailDispatchResult,
  type EmailMessage,
  type EmailTransport,
  type MarketingEmailInput,
  type RetailOpsStaffInviteEmailInput,
  createMarketingEarlyAccessAdminEmail,
  createMarketingEarlyAccessConfirmationEmail,
  createMarketingWaitlistAdminEmail,
  createMarketingWaitlistConfirmationEmail,
  createRetailOpsStaffInviteEmail,
  createTestRoutedEmailMessages,
  defaultMarketingEarlyAccessAdminSubject,
  defaultMarketingEarlyAccessConfirmationSubject,
  defaultMarketingWaitlistAdminSubject,
  defaultMarketingWaitlistConfirmationSubject,
  defaultRetailOpsStaffInviteSubject,
  dispatchEmailMessages,
} from "@ewatrade/email"

import type { NotificationContact } from "../contacts"
import type { NotificationChannelDispatch } from "../delivery"

type PlannedEmailMessage = {
  deliveryRole: "admin" | "customer"
  message: EmailMessage
  recipientEmail: string
}

export type EmailServiceDeliveryResult = {
  deliveryRole: "admin" | "customer"
  error?: string
  failedAt?: string
  notificationType: string
  provider?: string
  providerMessageId?: string
  recipientEmail: string
  sentAt?: string
  status: "failed" | "sent"
  subject: string
}

function getEmailFrom() {
  return process.env.EMAIL_FROM ?? "noreply@ewatrade.local"
}

function getEmailReplyTo() {
  return process.env.EMAIL_REPLY_TO
}

function isEmailRecipient(
  recipient: NotificationContact,
): recipient is Extract<NotificationContact, { kind: "email" }> {
  return recipient.kind === "email"
}

function planEmailMessagesForDispatch(
  dispatch: NotificationChannelDispatch,
): PlannedEmailMessage[] {
  const from = getEmailFrom()
  const replyTo = getEmailReplyTo()
  const emailRecipients = dispatch.recipients.filter(isEmailRecipient)

  switch (dispatch.notificationType) {
    case "marketing_early_access_requested": {
      const payload = {
        ...(dispatch.payload as Omit<MarketingEmailInput, "type">),
        type: "EARLY_ACCESS",
      } satisfies MarketingEmailInput

      return emailRecipients.map((recipient) =>
        recipient.deliveryRole === "customer"
          ? {
              deliveryRole: "customer",
              message: createMarketingEarlyAccessConfirmationEmail({
                from,
                input: payload,
                replyTo,
                subject: defaultMarketingEarlyAccessConfirmationSubject(),
                to: recipient.email,
              }),
              recipientEmail: recipient.email,
            }
          : {
              deliveryRole: "admin",
              message: createMarketingEarlyAccessAdminEmail({
                from,
                input: payload,
                replyTo,
                subject: defaultMarketingEarlyAccessAdminSubject(),
                to: recipient.email,
              }),
              recipientEmail: recipient.email,
            },
      )
    }
    case "marketing_waitlist_joined": {
      const payload = {
        ...(dispatch.payload as Omit<MarketingEmailInput, "type">),
        type: "WAITLIST",
      } satisfies MarketingEmailInput

      return emailRecipients.map((recipient) =>
        recipient.deliveryRole === "customer"
          ? {
              deliveryRole: "customer",
              message: createMarketingWaitlistConfirmationEmail({
                from,
                input: payload,
                replyTo,
                subject: defaultMarketingWaitlistConfirmationSubject(),
                to: recipient.email,
              }),
              recipientEmail: recipient.email,
            }
          : {
              deliveryRole: "admin",
              message: createMarketingWaitlistAdminEmail({
                from,
                input: payload,
                replyTo,
                subject: defaultMarketingWaitlistAdminSubject(),
                to: recipient.email,
              }),
              recipientEmail: recipient.email,
            },
      )
    }
    case "retail_ops_staff_invited": {
      const payload = dispatch.payload as RetailOpsStaffInviteEmailInput

      return emailRecipients.map((recipient) => ({
        deliveryRole: recipient.deliveryRole === "admin" ? "admin" : "customer",
        message: createRetailOpsStaffInviteEmail({
          from,
          input: payload,
          replyTo,
          subject: defaultRetailOpsStaffInviteSubject({
            businessName: payload.businessName,
          }),
          to: recipient.email,
        }),
        recipientEmail: recipient.email,
      }))
    }
    default:
      throw new Error(
        `Unsupported email notification type: ${dispatch.notificationType}`,
      )
  }
}

function toEmailServiceDeliveryResult(input: {
  dispatch: NotificationChannelDispatch
  planned: PlannedEmailMessage
  result: EmailDispatchResult
}): EmailServiceDeliveryResult {
  return {
    deliveryRole: input.planned.deliveryRole,
    error: input.result.error,
    failedAt: input.result.failedAt,
    notificationType: input.dispatch.notificationType,
    provider: input.result.provider,
    providerMessageId: input.result.providerMessageId,
    recipientEmail: input.planned.recipientEmail,
    sentAt: input.result.sentAt,
    status: input.result.status,
    subject: input.planned.message.subject,
  }
}

export class EmailService {
  async sendBulk(
    dispatches: NotificationChannelDispatch[],
    transport?: EmailTransport,
  ) {
    const emailDispatches = dispatches.filter(
      (dispatch) => dispatch.channel === "email",
    )

    if (!emailDispatches.length) {
      return {
        deliveries: [] satisfies EmailServiceDeliveryResult[],
        failed: 0,
        sent: 0,
        skipped: dispatches.length,
      }
    }

    let sent = 0
    let failed = 0
    let skipped = dispatches.length - emailDispatches.length
    const deliveries: EmailServiceDeliveryResult[] = []

    for (const dispatch of emailDispatches) {
      const plannedMessages = planEmailMessagesForDispatch(dispatch)

      if (!plannedMessages.length) {
        skipped += 1
        continue
      }

      const routedPlannedMessages = plannedMessages.flatMap((planned) =>
        createTestRoutedEmailMessages(planned.message).map((message) => ({
          ...planned,
          message,
          recipientEmail: message.to,
        })),
      )
      const results = await dispatchEmailMessages(
        routedPlannedMessages.map((planned) => planned.message),
        transport,
      )

      for (const [index, result] of results.entries()) {
        const planned = routedPlannedMessages[index]

        if (!planned) continue

        if (result.status === "sent") {
          sent += 1
        } else {
          failed += 1
        }

        deliveries.push(
          toEmailServiceDeliveryResult({
            dispatch,
            planned,
            result,
          }),
        )
      }
    }

    return {
      deliveries,
      failed,
      sent,
      skipped,
    }
  }
}
