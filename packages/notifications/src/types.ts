export type NotificationChannel = "email" | "in_app"

export type NotificationVariant = "info" | "success" | "warning" | "error"

export type NotificationRecipient = {
  email?: string
  id?: string
  kind: "email" | "user"
  name?: string
}

export type NotificationDispatch<TPayload = unknown> = {
  channels: NotificationChannel[]
  description?: string
  notificationType: string
  payload: TPayload
  recipients: NotificationRecipient[]
  title: string
  variant?: NotificationVariant
}

export type LeadNotificationPayload = {
  companyName?: string | null
  email: string
  fullName: string
  id: string
  message?: string | null
  phone?: string | null
  roleTitle?: string | null
  type: "EARLY_ACCESS" | "WAITLIST"
}
