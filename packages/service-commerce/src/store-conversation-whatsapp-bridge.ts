import {
  type StoreConversationWhatsAppBridgeChoice,
  type StoreConversationWhatsAppBridgeIssueProjection,
  type StoreConversationWhatsAppBridgeRequestKind,
  storeConversationWhatsAppBridgeTokenSchema,
} from "./schemas/store-conversation-whatsapp-bridge"

export type StoreConversationWhatsAppBridgeClientOperation = {
  bridgeToken: string
  clientOperationId: string
  scope: string
}

export function resolveStoreConversationWhatsAppBridgeClientOperation(input: {
  createId: () => string
  createToken: () => string
  current: StoreConversationWhatsAppBridgeClientOperation | null
  scope: string
}): StoreConversationWhatsAppBridgeClientOperation {
  if (input.current?.scope === input.scope) return input.current
  const clientOperationId = input.createId().trim()
  const scope = input.scope.trim()
  if (!clientOperationId || !scope) {
    throw new Error("A WhatsApp bridge operation and scope are required.")
  }
  return {
    bridgeToken: storeConversationWhatsAppBridgeTokenSchema.parse(
      input.createToken(),
    ),
    clientOperationId,
    scope,
  }
}

export async function executeStoreConversationWhatsAppBridgeNavigation(input: {
  issue: (
    operation: StoreConversationWhatsAppBridgeClientOperation,
  ) => Promise<StoreConversationWhatsAppBridgeIssueProjection>
  navigate: (navigationUrl: string) => Promise<void> | void
  operation: StoreConversationWhatsAppBridgeClientOperation
}) {
  const issued = await input.issue(input.operation)
  await input.navigate(issued.navigationUrl)
  return issued
}

export function projectStoreConversationWhatsAppAction(input: {
  action: "continue_on_whatsapp" | "reach_store_faster_on_whatsapp"
  opening: boolean
}) {
  return {
    label: input.opening
      ? "Preparing WhatsApp…"
      : input.action === "continue_on_whatsapp"
        ? "Continue on WhatsApp"
        : "Reach the Store faster on WhatsApp",
    primary: input.action === "continue_on_whatsapp",
  }
}

export const STORE_CONVERSATION_WHATSAPP_BRIDGE_MESSAGE_PREFIX =
  "Continue on EwaTrade: "
export const STORE_CONVERSATION_WHATSAPP_PRODUCT_REQUEST_ACTION =
  "intent:product"

export const STORE_CONVERSATION_WHATSAPP_BRIDGE_LIFETIME_MS = 10 * 60_000

export function buildStoreConversationWhatsAppBridgeMessage(
  bridgeToken: string,
) {
  return `${STORE_CONVERSATION_WHATSAPP_BRIDGE_MESSAGE_PREFIX}${storeConversationWhatsAppBridgeTokenSchema.parse(bridgeToken)}`
}

export function normalizeWhatsAppNavigationNumber(displayNumber: string) {
  const digits = displayNumber.replace(/\D/g, "")
  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error("A valid WhatsApp display number is required.")
  }
  return digits
}

export function buildStoreConversationWhatsAppNavigationUrl(input: {
  bridgeToken: string
  displayNumber: string
}) {
  const number = normalizeWhatsAppNavigationNumber(input.displayNumber)
  const url = new URL(`https://wa.me/${number}`)
  url.searchParams.set(
    "text",
    buildStoreConversationWhatsAppBridgeMessage(input.bridgeToken),
  )
  return url.toString()
}

export function storeConversationWhatsAppBridgeRequestKindAction(
  kind: StoreConversationWhatsAppBridgeRequestKind,
) {
  if (kind === "commerce_inquiry") {
    return {
      id: STORE_CONVERSATION_WHATSAPP_PRODUCT_REQUEST_ACTION,
      title: "Product request",
    }
  }
  return neverRequestKind(kind)
}

function neverRequestKind(value: never): never {
  throw new Error(
    `Unsupported Store Conversation request kind: ${String(value)}`,
  )
}

export function storeConversationWhatsAppBridgeChoiceLabel(
  choice: StoreConversationWhatsAppBridgeChoice,
) {
  return choice === "continue_current_request"
    ? "Continue where I stopped"
    : "Start a new request"
}
