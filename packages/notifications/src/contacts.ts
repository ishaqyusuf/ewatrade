export type NotificationDeliveryRole = "admin" | "customer"

export type NotificationContactKind = "email" | "user"

export type EmailNotificationContact = {
  deliveryRole?: NotificationDeliveryRole
  displayName?: string
  email: string
  kind: "email"
}

export type UserNotificationContact = {
  deliveryRole?: NotificationDeliveryRole
  displayName?: string
  email?: string
  kind: "user"
  userId: string
}

export type NotificationContact = EmailNotificationContact | UserNotificationContact

export function createEmailNotificationContact(
  input: Omit<EmailNotificationContact, "kind">
): EmailNotificationContact {
  return {
    ...input,
    kind: "email"
  }
}

export function createUserNotificationContact(
  input: Omit<UserNotificationContact, "kind">
): UserNotificationContact {
  return {
    ...input,
    kind: "user"
  }
}
