/** Initial launch scope approved by the owner on 9 October 2026.
 * A saved declaration is not identity verification or age assurance.
 */
export function canUseStoreConversationFreeFormChat(input: {
  ageBand: string | null | undefined
  principal: "account" | "guest"
}) {
  return input.principal === "account" && input.ageBand === "ADULT"
}

export const STORE_CONVERSATION_CHAT_SCOPE_MESSAGE =
  "Free-form Store chat is available to signed-in accounts declaring age 18 or older. Account and catalog access, reporting and support remain available."
