import { assistantRouteConversation } from "../assistant/assistant-route-conversation"

/** Separate exact saved-chat snapshots from the ordinary Store setup cache. */
export function setupRouteCacheKey(
  scope: string | null,
  expectedConversationId?: string,
) {
  const requested = assistantRouteConversation(expectedConversationId)
  if (!scope || requested.kind === "invalid") return null
  const base = `ewatrade:setup-assistant:v1:${scope}`
  return requested.kind === "saved"
    ? `${base}:chat:${encodeURIComponent(requested.conversationId)}`
    : base
}

/** Display/cache matching only; the canonical state reader owns actor/Store authority. */
export function matchesSetupRouteConversation(
  value: unknown,
  expectedConversationId?: string,
) {
  const requested = assistantRouteConversation(expectedConversationId)
  if (requested.kind === "none") return true
  if (
    requested.kind === "invalid" ||
    !value ||
    typeof value !== "object" ||
    !("conversation" in value)
  )
    return false
  const conversation = value.conversation
  return Boolean(
    conversation &&
      typeof conversation === "object" &&
      "id" in conversation &&
      conversation.id === requested.conversationId &&
      "status" in conversation &&
      conversation.status === "ACTIVE",
  )
}
