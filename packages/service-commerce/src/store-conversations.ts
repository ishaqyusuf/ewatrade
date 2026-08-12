import type { ServiceCommercePublicEntryRequestKind } from "./schemas/customer-channels"
import type {
  StoreConversationAuthorKind,
  StoreConversationChannel,
  StoreConversationMessageKind,
  StoreConversationRequestKind,
  StoreConversationRequestStatus,
} from "./schemas/store-conversations"

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
  status: StoreConversationRequestStatus
}

export type StoreConversationQueueItemProjection = {
  assignedToCurrentUser: boolean
  conversationId: string
  lastActivityAt: Date
  lastMessageSequence: number
  requestKinds: StoreConversationRequestKind[]
  state: "new" | "assigned"
}

export function projectStoreConversationCursor(input: {
  hasMore: boolean
  messages: Array<{ sequence: number }>
}) {
  return input.hasMore ? (input.messages.at(-1)?.sequence ?? null) : null
}
