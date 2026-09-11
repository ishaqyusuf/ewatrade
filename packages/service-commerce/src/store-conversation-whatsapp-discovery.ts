import type {
  StoreConversationWhatsAppCandidateAction,
  StoreConversationWhatsAppCandidatePrompt,
  StoreConversationWhatsAppObservedStatusProjection,
} from "./schemas/store-conversation-whatsapp-discovery"

export const STORE_CONVERSATION_WHATSAPP_CANDIDATE_LIFETIME_MS = 10 * 60 * 1_000
export const STORE_CONVERSATION_WHATSAPP_CANDIDATE_RECENCY_MS =
  30 * 24 * 60 * 60 * 1_000

const candidateActions: StoreConversationWhatsAppCandidateAction[] = [
  "continue",
  "start_new",
  "not_mine",
]

export function storeConversationWhatsAppCandidateActionLabel(
  action: StoreConversationWhatsAppCandidateAction,
) {
  if (action === "continue") return "Continue that conversation"
  if (action === "start_new") return "Start a new request"
  return "That isn't mine"
}

export function projectStoreConversationWhatsAppCandidatePrompt(): StoreConversationWhatsAppCandidatePrompt {
  return {
    actions: candidateActions.map((action) => ({
      action,
      label: storeConversationWhatsAppCandidateActionLabel(action),
    })),
    message:
      "A recent EwaTrade conversation may be available for this Store. Choose how to continue.",
  }
}

const statusPriority = {
  deleted: 7,
  unsupported: 6,
  read: 5,
  delivered: 4,
  failed: 3,
  sent: 2,
  received: 1,
} as const

export function projectCurrentStoreConversationWhatsAppObservedStatus(
  events: StoreConversationWhatsAppObservedStatusProjection[],
) {
  return events.reduce<StoreConversationWhatsAppObservedStatusProjection | null>(
    (current, event) => {
      if (!current || event.occurredAt > current.occurredAt) return event
      if (
        event.occurredAt.getTime() === current.occurredAt.getTime() &&
        statusPriority[event.status] > statusPriority[current.status]
      ) {
        return event
      }
      return current
    },
    null,
  )
}

export function storeConversationWhatsAppProviderHistoryAvailability(input: {
  businessAppHistoryAuthorized: boolean
  providerSupportsHistory: boolean
}) {
  return input.businessAppHistoryAuthorized && input.providerSupportsHistory
    ? "available"
    : "provider_history_unavailable"
}

export function storeConversationWhatsAppObservedStatusLabel(
  status: StoreConversationWhatsAppObservedStatusProjection["status"],
) {
  if (status === "received") return "received on WhatsApp"
  if (status === "sent") return "sent to WhatsApp"
  if (status === "delivered") return "delivered by WhatsApp"
  if (status === "read") return "read on WhatsApp"
  if (status === "failed") return "WhatsApp delivery failed"
  if (status === "deleted") return "deleted on WhatsApp"
  return "unsupported WhatsApp event"
}
