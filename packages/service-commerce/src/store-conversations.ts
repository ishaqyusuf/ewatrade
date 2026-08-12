import type { ServiceCommercePublicEntryRequestKind } from "./schemas/customer-channels"
import type {
  StoreConversationAuthorKind,
  StoreConversationChannel,
  StoreConversationMessageKind,
  StoreConversationRequestKind,
  StoreConversationRequestStatus,
} from "./schemas/store-conversations"

export const DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES = 15

export type StoreConversationMessageProjection = {
  author: {
    kind: StoreConversationAuthorKind
    label: string
  }
  channel: StoreConversationChannel
  id: string
  kind: StoreConversationMessageKind
  occurredAt: Date
  request?: {
    id: string
    kind: StoreConversationRequestKind
  }
  sequence: number
  text: string
}

export type StoreConversationTimelineProjection = {
  availableRequestKinds: ServiceCommercePublicEntryRequestKind[]
  conversation: {
    id: string
    state: "active" | "archived" | "restricted"
    storeName: string
  }
  messages: StoreConversationMessageProjection[]
  nextCursor: number | null
  requests: StoreConversationRequestSummaryProjection[]
}

export type StoreConversationRequestSummaryProjection = {
  createdAt: Date
  id: string
  kind: StoreConversationRequestKind
  label: string
  lifecycle: "active" | "terminal"
  revision: number
  status: StoreConversationRequestStatus
}

export type StoreConversationQueueItemProjection = {
  assignment: {
    label: string | null
    revision: number
  }
  assignedToCurrentUser: boolean
  conversationId: string
  lastCustomerActivityAt: Date
  lastMessageSequence: number
  requests: Array<
    Pick<
      StoreConversationRequestSummaryProjection,
      "kind" | "label" | "lifecycle" | "status"
    >
  >
  requestKinds: StoreConversationRequestKind[]
  sla: StoreConversationSlaProjection
  state: "new" | "assigned"
  unreadCustomerMessages: number
}

export type StoreConversationSlaProjection = {
  dueAt: Date | null
  state: "awaiting_response" | "overdue" | "responded"
}

export function projectStoreConversationSla(input: {
  lastCustomerMessageAt: Date | null
  lastStoreReplyAt: Date | null
  now: Date
  responseSlaMinutes?: number
}): StoreConversationSlaProjection {
  if (
    !input.lastCustomerMessageAt ||
    (input.lastStoreReplyAt &&
      input.lastStoreReplyAt.getTime() >= input.lastCustomerMessageAt.getTime())
  ) {
    return { dueAt: null, state: "responded" }
  }
  const dueAt = new Date(
    input.lastCustomerMessageAt.getTime() +
      (input.responseSlaMinutes ??
        DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES) *
        60_000,
  )
  return {
    dueAt,
    state:
      input.now.getTime() >= dueAt.getTime() ? "overdue" : "awaiting_response",
  }
}

export function projectStoreConversationCursor(input: {
  hasMore: boolean
  messages: Array<{ sequence: number }>
}) {
  return input.hasMore ? (input.messages.at(-1)?.sequence ?? null) : null
}
