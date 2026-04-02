import type {
  NotificationChannel,
  NotificationDispatch,
  NotificationRecipient
} from "./types"

export type NotificationChannelDispatch = {
  channel: NotificationChannel
  description?: string
  notificationType: string
  payload: unknown
  recipients: NotificationRecipient[]
  title: string
  variant: NonNullable<NotificationDispatch["variant"]>
}

export type NotificationDeliveryPlan = {
  dispatches: NotificationChannelDispatch[]
  skippedChannels: Array<{ channel: NotificationChannel; reason: string }>
}

function supportsChannel(
  recipient: NotificationRecipient,
  channel: NotificationChannel
) {
  if (channel === "email") {
    return Boolean(recipient.email)
  }

  return recipient.kind === "user"
}

export function planNotificationDeliveries(
  notification: NotificationDispatch
): NotificationDeliveryPlan {
  const dispatches: NotificationChannelDispatch[] = []
  const skippedChannels: NotificationDeliveryPlan["skippedChannels"] = []

  for (const channel of notification.channels) {
    const recipients = notification.recipients.filter((recipient) =>
      supportsChannel(recipient, channel)
    )

    if (recipients.length === 0) {
      skippedChannels.push({
        channel,
        reason:
          channel === "email"
            ? "No recipients had an email address for email delivery."
            : "No user recipients were available for in-app delivery."
      })
      continue
    }

    dispatches.push({
      channel,
      description: notification.description,
      notificationType: notification.notificationType,
      payload: notification.payload,
      recipients,
      title: notification.title,
      variant: notification.variant ?? "info"
    })
  }

  return {
    dispatches,
    skippedChannels
  }
}
