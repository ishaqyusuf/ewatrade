import type { z } from "zod"

import type { NotificationContact } from "../contacts"
import type { NotificationChannel } from "../core-types"
import { ewatradeNotificationTypes } from "../notification-types"

export type NotificationAuthor = {
  id: string
}

export type NotificationRecipients = NotificationContact[] | null

export type EwatradeNotificationType = keyof typeof ewatradeNotificationTypes & string

export type NotificationPayload<TType extends EwatradeNotificationType> = z.infer<
  (typeof ewatradeNotificationTypes)[TType]["schema"]
>

export type NotificationEvent<TType extends EwatradeNotificationType> = {
  author: NotificationAuthor
  channels?: NotificationChannel[]
  payload: NotificationPayload<TType>
  recipients: NotificationRecipients
  type: TType
}

export type NotificationTriggerInput<TType extends EwatradeNotificationType> = Omit<
  NotificationEvent<TType>,
  "author" | "recipients" | "type"
> & {
  author?: NotificationAuthor
  recipients?: NotificationRecipients
}
