export type CustomerConversationListEmptyPresentation =
  | {
      icon: "MessageCircle"
      message: "Open a store’s ẸwáTrade chat link to start a conversation. It will stay here when you come back."
      mode: "empty"
      sourceLabel: "Chats start from a store link"
      title: "No conversations yet"
    }
  | {
      mode: "expired"
      title: "Guest access ended"
      message: "Open the store’s latest chat link to continue. Sign in to see conversations linked to your account."
    }
  | { mode: "loading" }
  | {
      actionLabel: "Try again" | "Trying again…"
      icon: "WifiOff"
      message: "Check your connection and try again."
      mode: "error"
      title: "Conversations unavailable"
    }

export function isCustomerConversationListUnavailableQaState(input: {
  development: boolean
  qaState?: string | string[]
}) {
  return input.development && input.qaState === "unavailable"
}

export function resolveCustomerConversationListEmptyPresentation(input: {
  credentialRejected: boolean
  error: boolean
  loading: boolean
  retrying?: boolean
}): CustomerConversationListEmptyPresentation {
  if (input.loading) return { mode: "loading" }
  if (input.credentialRejected)
    return {
      mode: "expired",
      title: "Guest access ended",
      message:
        "Open the store’s latest chat link to continue. Sign in to see conversations linked to your account.",
    }
  if (!input.error) {
    return {
      icon: "MessageCircle",
      message:
        "Open a store’s ẸwáTrade chat link to start a conversation. It will stay here when you come back.",
      mode: "empty",
      sourceLabel: "Chats start from a store link",
      title: "No conversations yet",
    }
  }

  return {
    actionLabel: input.retrying ? "Trying again…" : "Try again",
    icon: "WifiOff",
    message: "Check your connection and try again.",
    mode: "error",
    title: "Conversations unavailable",
  }
}
