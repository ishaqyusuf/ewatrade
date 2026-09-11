import type { StoreConversationNotificationPreferenceProjection } from "@ewatrade/service-commerce"

import { Prisma } from "../../../generated/prisma/client"
import {
  StoreConversationNotificationChannel,
  type StoreConversationNotificationCommandKind,
} from "../../../generated/prisma/enums"
import { storeConversationPayloadHash } from "../store-conversations-core"

export type StoreConversationNotificationErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_READY"
  | "RATE_LIMITED"

export class StoreConversationNotificationError extends Error {
  constructor(
    readonly code: StoreConversationNotificationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationNotificationError"
  }
}

export const STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

export function notificationPayloadHash(value: unknown) {
  return storeConversationPayloadHash(value)
}

export function databaseNotificationChannel(
  channel: "email" | "push" | "whatsapp",
) {
  if (channel === "email") return StoreConversationNotificationChannel.EMAIL
  if (channel === "whatsapp")
    return StoreConversationNotificationChannel.WHATSAPP
  return StoreConversationNotificationChannel.PUSH
}

export function projectNotificationPreference(input: {
  orderedChannels: Prisma.JsonValue
  reopeningEnabled: boolean
  unreadEnabled: boolean
}): StoreConversationNotificationPreferenceProjection {
  if (!Array.isArray(input.orderedChannels)) {
    throw new StoreConversationNotificationError(
      "NOT_READY",
      "Notification preferences must be updated.",
    )
  }
  const channels = input.orderedChannels.filter(
    (channel): channel is "email" | "push" | "whatsapp" =>
      channel === "email" || channel === "push" || channel === "whatsapp",
  )
  if (
    channels.length !== input.orderedChannels.length ||
    channels.length === 0 ||
    new Set(channels).size !== channels.length
  ) {
    throw new StoreConversationNotificationError(
      "NOT_READY",
      "Notification preferences must be updated.",
    )
  }
  return {
    orderedChannels: channels,
    reopeningEnabled: input.reopeningEnabled,
    unreadEnabled: input.unreadEnabled,
  }
}

export function assertNotificationCommandReplay(input: {
  actualKind: StoreConversationNotificationCommandKind
  actualPayloadHash: string
  expectedKind: StoreConversationNotificationCommandKind
  expectedPayloadHash: string
}) {
  if (
    input.actualKind !== input.expectedKind ||
    input.actualPayloadHash !== input.expectedPayloadHash
  ) {
    throw new StoreConversationNotificationError(
      "CONFLICT",
      "This notification command was already used with different details.",
    )
  }
}

export function translateNotificationWriteError(error: unknown): never {
  if (error instanceof StoreConversationNotificationError) throw error
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new StoreConversationNotificationError(
      "CONFLICT",
      "Notification settings changed. Refresh and try again.",
    )
  }
  throw error
}
