import type { ServiceCommerceCustomerActionProjection } from "./schemas/action"
import type { ServiceCommercePublicEntryRequestKind } from "./schemas/customer-channels"
import type { StoreConversationAccountInvitationProjection } from "./schemas/store-conversation-accounts"
import type { StoreConversationChannelModeProjection } from "./schemas/store-conversation-channel-mode"
import type {
  StoreConversationWhatsAppObservationProvenance,
  StoreConversationWhatsAppObservationStatus,
} from "./schemas/store-conversation-whatsapp-discovery"
import type {
  StoreConversationAuthorKind,
  StoreConversationChannel,
  StoreConversationMessageKind,
  StoreConversationQuoteActionMessageProjection,
  StoreConversationRequestKind,
  StoreConversationRequestStatus,
} from "./schemas/store-conversations"
import type { StoreConversationAvailabilityProjection } from "./store-conversation-availability"

export const DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES = 15
export const STORE_CONVERSATION_GUEST_CREDENTIAL_ROTATION_INTERVAL_MS =
  30 * 24 * 60 * 60 * 1_000

export function isStoreConversationGuestCredentialRotationDue(input: {
  issuedAt?: Date | string | null
  now?: Date
}) {
  if (!input.issuedAt) return true
  const issuedAt = new Date(input.issuedAt).getTime()
  return (
    !Number.isFinite(issuedAt) ||
    issuedAt + STORE_CONVERSATION_GUEST_CREDENTIAL_ROTATION_INTERVAL_MS <=
      (input.now ?? new Date()).getTime()
  )
}
export const STORE_CONVERSATION_VOICE_NOTE_MAX_BYTES = 5_000_000
export const STORE_CONVERSATION_VOICE_NOTE_MAX_DURATION_MS = 60_000
export const STORE_CONVERSATION_VOICE_NOTE_MIN_DURATION_MS = 500

export type StoreConversationAttachmentProjection = {
  id: string
  durationMs: number | null
  kind: "audio" | "document" | "image"
  label: "Document attachment" | "Image attachment" | "Voice note"
  recovery: "contact_store" | "remove_and_retry" | "retry" | null
  state:
    | "deleted"
    | "pending"
    | "quarantined"
    | "rejected"
    | "retryable"
    | "safe"
  viewable: boolean
}

export type StoreConversationAttachmentCapabilityProjection = {
  acceptedMimeTypes: Array<
    | "application/pdf"
    | "image/heic"
    | "image/heif"
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "audio/mp4"
    | "audio/mpeg"
    | "audio/ogg"
    | "audio/wav"
    | "audio/webm"
  >
  allowedKinds: Array<"audio" | "document" | "image">
  available: boolean
  blockers: Array<
    | "attachments_disabled"
    | "channel_unavailable"
    | "policy_restricted"
    | "private_media_provider_unavailable"
    | "request_required"
    | "request_stale"
  >
  limits: {
    maxAudioBytes: number
    maxBytes: number
    maxCount: number
    maxDurationMs: number
  }
  uploadAuthorization: {
    expiresAt: Date
    token: string
  } | null
}

export function projectStoreConversationAttachment(input: {
  id: string
  kind: string
  lifecycle: string
  ownerKind: "generic" | "prescription"
  verifiedDurationMs?: number | null
}): StoreConversationAttachmentProjection {
  const lifecycle = input.lifecycle.toLowerCase()
  const state =
    lifecycle === "safe"
      ? "safe"
      : lifecycle === "quarantined"
        ? "quarantined"
        : lifecycle === "rejected"
          ? "rejected"
          : lifecycle === "retryable"
            ? "retryable"
            : lifecycle === "deleted"
              ? "deleted"
              : "pending"
  const normalizedKind = input.kind.toLowerCase()
  const kind =
    normalizedKind === "image"
      ? "image"
      : normalizedKind === "audio"
        ? "audio"
        : "document"
  const recovery =
    state === "retryable"
      ? "retry"
      : state === "rejected" || state === "deleted"
        ? "remove_and_retry"
        : state === "quarantined"
          ? "contact_store"
          : null
  return {
    id: input.id,
    durationMs: kind === "audio" ? (input.verifiedDurationMs ?? null) : null,
    kind,
    label:
      kind === "image"
        ? "Image attachment"
        : kind === "audio"
          ? "Voice note"
          : "Document attachment",
    recovery,
    state,
    viewable: state === "safe",
  }
}

export const STORE_CONVERSATION_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
] as const

export type StoreConversationMessageProjection = {
  accountInvitation?: StoreConversationAccountInvitationProjection
  actionMessage?: StoreConversationQuoteActionMessageProjection
  attachments: StoreConversationAttachmentProjection[]
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
  whatsAppObservation?: {
    occurredAt: Date
    provenance: StoreConversationWhatsAppObservationProvenance
    status: StoreConversationWhatsAppObservationStatus
  }
}

export function projectStoreConversationQuoteActionMessage(input: {
  actions: ServiceCommerceCustomerActionProjection[]
  completed: boolean
  currencyCode: string
  expiresAt: Date | null
  now: Date
  options: Array<{
    id: string
    label: string
    position: number
    totalMinor: number
  }>
  quoteVersion: number
  revokedAt: Date | null
  selectedOptionId: string | null
  status:
    | "accepted"
    | "declined"
    | "expired"
    | "issued"
    | "rejected"
    | "revoked"
    | "superseded"
}): StoreConversationQuoteActionMessageProjection {
  const lifecycle =
    input.revokedAt || input.status === "revoked"
      ? "revoked"
      : input.status === "declined" || input.status === "rejected"
        ? "rejected"
        : input.status === "superseded"
          ? "superseded"
          : input.status === "expired" ||
              (input.expiresAt && input.expiresAt <= input.now)
            ? "expired"
            : input.completed
              ? "completed"
              : "current"
  return {
    actions:
      lifecycle === "current" || lifecycle === "completed" ? input.actions : [],
    currencyCode: input.currencyCode,
    kind: "quote",
    lifecycle,
    options: [...input.options]
      .sort((left, right) => left.position - right.position)
      .map((option) => ({
        id: option.id,
        label: option.label,
        selected:
          option.id === input.selectedOptionId ||
          (!input.selectedOptionId && input.options.length === 1),
        totalMinor: option.totalMinor,
      })),
    quoteVersion: input.quoteVersion,
    recovery:
      lifecycle === "expired" || lifecycle === "superseded"
        ? "refresh"
        : lifecycle === "rejected" || lifecycle === "revoked"
          ? "talk_to_store"
          : null,
  }
}

export type StoreConversationTimelineProjection = {
  availability: StoreConversationAvailabilityProjection
  availableRequestKinds: ServiceCommercePublicEntryRequestKind[]
  channelMode: StoreConversationChannelModeProjection
  conversation: {
    id: string
    moderation: StoreConversationModerationProjection
    state: "active" | "archived" | "restricted"
    storeName: string
  }
  messages: StoreConversationMessageProjection[]
  nextCursor: number | null
  requests: StoreConversationRequestSummaryProjection[]
}

export type StoreConversationMessagesAfterProjection = {
  actionMessageUpdates: Array<{
    actionMessage: StoreConversationQuoteActionMessageProjection
    messageId: string
  }>
  lastMessageSequence: number
  messages: StoreConversationMessageProjection[]
  nextCursor: number | null
}

export type StoreConversationGuestMessagesAfterProjection =
  StoreConversationMessagesAfterProjection & {
    availability: StoreConversationAvailabilityProjection
    channelMode: StoreConversationChannelModeProjection
    moderation: StoreConversationModerationProjection
  }

export type StoreConversationCustomerProgressProjection = {
  deliveredThroughSequence: number
  readThroughSequence: number
  replayed: boolean
}

export type StoreConversationStaffReadProjection = {
  readThroughSequence: number
  replayed: boolean
}

export type StoreConversationListItemProjection = {
  conversationId: string
  lastActivityAt: Date
  lastMessageSequence: number
  unreadStoreMessages: number
  lastMessage: {
    author: "customer" | "store" | "system"
    text: string
  } | null
  publicToken: string
  state: "active" | "archived" | "restricted"
  storeName: string
  storeAvatar: { kind: "initials"; label: string }
}

export type StoreConversationMobileListProjection = {
  credentialExpiresAt: Date
  items: StoreConversationListItemProjection[]
  nextCursor: string | null
}

export type StoreConversationTransferProjection = {
  expiresAt: Date
  state: "claimed" | "redeemed"
}

export type StoreConversationGuestCredentialRotationProjection = {
  credentialExpiresAt: Date
  credentialToken: string
  overlapExpiresAt: Date
  replayed: boolean
}

export type StoreConversationModerationProjection = {
  customerMessage: string | null
  recovery: "return_to_store_entry" | "wait_for_reinstatement" | null
  restrictedAt: Date | null
  revision: number
  state: "open" | "restricted"
}

export function projectStoreConversationModeration(input: {
  moderationRevision: number
  moderationState: "OPEN" | "RESTRICTED"
  restrictedAt: Date | null
}): StoreConversationModerationProjection {
  if (input.moderationState === "RESTRICTED") {
    return {
      customerMessage:
        "This Store has paused new messages in this conversation. Your existing history and requests are still available.",
      recovery: "wait_for_reinstatement",
      restrictedAt: input.restrictedAt,
      revision: input.moderationRevision,
      state: "restricted",
    }
  }
  return {
    customerMessage: null,
    recovery: null,
    restrictedAt: null,
    revision: input.moderationRevision,
    state: "open",
  }
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
      "id" | "kind" | "label" | "lifecycle" | "status"
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
