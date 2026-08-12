import type {
  StoreConversationAuthorKind,
  StoreConversationChannel,
  StoreConversationMessageKind,
  StoreConversationRequestKind,
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
  conversation: {
    id: string
    state: "active" | "archived" | "restricted"
    storeName: string
  }
  messages: StoreConversationMessageProjection[]
  nextCursor: number | null
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
