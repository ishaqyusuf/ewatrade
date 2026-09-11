import { parseCustomerConversationDetailQaState } from "./customer-conversation-detail-qa"
import { parseCustomerConversationListQaState } from "./customer-conversation-list-qa"

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,200}$/

function customerChatHost() {
  return (
    process.env.EXPO_PUBLIC_CUSTOMER_CHAT_HOST?.trim().toLowerCase() ||
    "chat.ewatrade.com"
  )
}

function storeTokenFromUrl(url: URL) {
  if (url.protocol === "https:") {
    if (url.hostname.toLowerCase() !== customerChatHost()) return null
    const match = url.pathname.match(/^\/r\/([^/]+)\/?$/)
    return match?.[1] ?? null
  }

  if (url.protocol === "ewatrade:" || url.protocol === "ewatrade-dev:") {
    if (url.hostname !== "r") return null
    const match = url.pathname.match(/^\/([^/]+)\/?$/)
    return match?.[1] ?? null
  }

  return null
}

export function resolveCustomerConversationQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null

  try {
    const url = new URL(path)
    const detailQaState = parseCustomerConversationDetailQaState({
      development,
      qaState: url.searchParams.get("qaState"),
    })
    if (
      detailQaState &&
      url.protocol === "ewatrade-dev:" &&
      url.hostname === "conversation"
    ) {
      return `/(customer)/conversations/qa-${detailQaState}?publicToken=qa-luma&qaState=${detailQaState}`
    }

    const qaState = parseCustomerConversationListQaState({
      development,
      qaState: url.searchParams.get("qaState"),
    })
    if (
      !qaState ||
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "conversations"
    ) {
      return null
    }

    return `/(customer)/conversations?qaState=${qaState}`
  } catch {
    return null
  }
}

export function resolveCustomerDeepLink(path: string): {
  path: string
  pendingTransfer: { publicToken: string; transferToken: string } | null
} {
  try {
    const url = new URL(path, `https://${customerChatHost()}`)
    const publicToken = storeTokenFromUrl(url)
    if (!publicToken || !TOKEN_PATTERN.test(publicToken)) {
      return { path: "/", pendingTransfer: null }
    }

    const storePath = `/r/${encodeURIComponent(publicToken)}`
    const transferMatch = url.hash.match(/^#transfer=([A-Za-z0-9_-]{32,200})$/)
    const transferToken = transferMatch?.[1]
    if (!transferToken || !TOKEN_PATTERN.test(transferToken)) {
      return { path: storePath, pendingTransfer: null }
    }

    return {
      path: storePath,
      pendingTransfer: { publicToken, transferToken },
    }
  } catch {
    return { path: "/", pendingTransfer: null }
  }
}

export function resolveCustomerSystemPath(path: string) {
  return resolveCustomerDeepLink(path).path
}
