import { normalizeHostname } from "./domain"

const DEFAULT_CUSTOMER_CHAT_ORIGIN = "https://chat.ewatrade.com"

function parsePublicOrigin(value: string) {
  const url = new URL(value)

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Customer chat origin must be a public HTTPS origin.")
  }

  return url.origin
}

export function resolveCustomerChatOrigin(input: {
  chatUrl?: string | null
  storefrontUrl?: string | null
}) {
  const configured = input.chatUrl?.trim()
  if (configured) return parsePublicOrigin(configured)

  const storefront = input.storefrontUrl?.trim()
  if (storefront) {
    const url = new URL(parsePublicOrigin(storefront))
    if (!url.hostname.startsWith("chat.")) {
      url.hostname = `chat.${url.hostname}`
    }
    return url.origin
  }

  return DEFAULT_CUSTOMER_CHAT_ORIGIN
}

export function buildCustomerChatEntryUrl(input: {
  origin: string
  publicToken: string
}) {
  const origin = parsePublicOrigin(input.origin)

  return `${origin}/r/${encodeURIComponent(input.publicToken)}`
}

export function isCustomerChatRequestHost(
  requestHost: string | null | undefined,
  chatOrigin: string,
) {
  if (!requestHost) return false

  const expected = new URL(parsePublicOrigin(chatOrigin)).hostname
  const actual = new URL(`https://${normalizeHostname(requestHost)}`).hostname

  return actual === expected
}
