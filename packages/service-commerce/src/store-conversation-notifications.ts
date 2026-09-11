import type { StoreConversationNotificationChannel } from "./schemas/store-conversation-notifications"

export const STORE_CONVERSATION_UNREAD_GRACE_SECONDS = {
  default: 45,
  maximum: 60,
  minimum: 30,
} as const

export type StoreConversationNotificationContactProjection = {
  channel: "email" | "whatsapp"
  contactId: string
  maskedDestination: string
  state: "pending" | "revoked" | "verified"
  verifiedAt: Date | null
}

export type StoreConversationNotificationPreferenceProjection = {
  orderedChannels: StoreConversationNotificationChannel[]
  reopeningEnabled: boolean
  unreadEnabled: boolean
}

export type StoreConversationNotificationRecovery =
  | "change_preference"
  | "register_push"
  | "retry_verification"
  | "verify_contact"

export type StoreConversationNotificationStatusProjection = {
  contacts: StoreConversationNotificationContactProjection[]
  preference: StoreConversationNotificationPreferenceProjection | null
  pushRegistered: boolean
  recovery: StoreConversationNotificationRecovery[]
}

export type StoreConversationNotificationEligibility = {
  email: boolean
  push: boolean
  whatsapp: boolean
}

export function selectStoreConversationNotificationChannel(input: {
  eligibility: StoreConversationNotificationEligibility
  orderedChannels: readonly StoreConversationNotificationChannel[]
}) {
  return (
    input.orderedChannels.find(
      (channel) => input.eligibility[channel] === true,
    ) ?? null
  )
}

export function prioritizeStoreConversationNotificationChannel(input: {
  channel: StoreConversationNotificationChannel
  orderedChannels: readonly StoreConversationNotificationChannel[]
}) {
  return [
    input.channel,
    ...input.orderedChannels.filter((channel) => channel !== input.channel),
  ]
}

function boundedStoreName(storeName: string) {
  const normalized = storeName.replace(/\s+/g, " ").trim()
  return normalized.slice(0, 80) || "Your Store"
}

export function renderStoreConversationNeutralNotification(input: {
  kind: "store_reopened" | "unread_response"
  storeName: string
}) {
  const storeName = boundedStoreName(input.storeName)
  return input.kind === "unread_response"
    ? {
        body: `You have a new response from ${storeName}.`,
        subject: "New Store response",
      }
    : {
        body: `${storeName} is available on EwaTrade Chat again.`,
        subject: "Store chat is available",
      }
}

export function maskStoreConversationNotificationDestination(input: {
  channel: "email" | "whatsapp"
  destination: string
}) {
  if (input.channel === "email") {
    const [local = "", domain = ""] = input.destination.split("@")
    const visible = local.slice(0, Math.min(2, local.length))
    return `${visible}${local.length > visible.length ? "•••" : ""}@${domain}`
  }
  const digits = input.destination.replace(/\D/g, "")
  return `+${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}
