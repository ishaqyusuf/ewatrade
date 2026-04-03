import type { NotificationContact } from "./contacts"

export type NotificationChannel = "email" | "in_app"

export type NotificationVariant = "info" | "success" | "warning" | "error"

export type NotificationStatus = "active" | "dismissed"

export type NotificationActionDescriptor = {
  actionId: string
  label: string
}

export type NotificationInput = {
  action?: NotificationActionDescriptor
  channels?: NotificationChannel[]
  description?: string
  durationMs?: number
  id?: string
  notificationType: string
  recipients?: NotificationContact[]
  title: string
  variant?: NotificationVariant
}

export type NotificationDispatch<TPayload = unknown> = {
  action?: NotificationActionDescriptor
  channels: NotificationChannel[]
  description?: string
  notificationType: string
  payload: TPayload
  recipients: NotificationContact[]
  title: string
  variant?: NotificationVariant
}

export type NotificationRecord = {
  action?: NotificationActionDescriptor
  channels: NotificationChannel[]
  createdAt: string
  description?: string
  durationMs?: number
  id: string
  notificationType: string
  recipients: NotificationContact[]
  status: NotificationStatus
  title: string
  variant: NotificationVariant
}

export type NotificationState = {
  notifications: NotificationRecord[]
}
