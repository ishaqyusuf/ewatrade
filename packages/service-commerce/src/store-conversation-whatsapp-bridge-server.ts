import { createHmac } from "node:crypto"

import {
  type StoreConversationWhatsAppBridgeChoice,
  type StoreConversationWhatsAppBridgeRequestKind,
  storeConversationWhatsAppBridgeChoiceTokenSchema,
  storeConversationWhatsAppBridgeTokenSchema,
} from "./schemas/store-conversation-whatsapp-bridge"
import {
  type StoreConversationWhatsAppCandidateAction,
  storeConversationWhatsAppCandidateActionTokenSchema,
} from "./schemas/store-conversation-whatsapp-discovery"
import {
  STORE_CONVERSATION_WHATSAPP_BRIDGE_MESSAGE_PREFIX,
  STORE_CONVERSATION_WHATSAPP_PRODUCT_REQUEST_ACTION,
} from "./store-conversation-whatsapp-bridge"

export function extractStoreConversationWhatsAppBridgeToken(
  message: string | undefined,
) {
  if (!message) return null
  const prefix = STORE_CONVERSATION_WHATSAPP_BRIDGE_MESSAGE_PREFIX.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  )
  const match = new RegExp(`^${prefix}([A-Za-z0-9_-]{43,128})$`).exec(message)
  if (!match?.[1]) return null
  const result = storeConversationWhatsAppBridgeTokenSchema.safeParse(match[1])
  return result.success ? result.data : null
}

export function isStoreConversationWhatsAppBridgeMessageCandidate(
  message: string | undefined,
) {
  return Boolean(
    message?.startsWith(STORE_CONVERSATION_WHATSAPP_BRIDGE_MESSAGE_PREFIX),
  )
}

export function parseStoreConversationWhatsAppBridgeChoiceToken(value: string) {
  const result =
    storeConversationWhatsAppBridgeChoiceTokenSchema.safeParse(value)
  return result.success ? result.data : null
}

export function isStoreConversationWhatsAppBridgeChoiceCandidate(
  value: string | undefined,
) {
  return Boolean(value?.startsWith("ewb1_"))
}

export function parseStoreConversationWhatsAppBridgeRequestKind(
  value: string | undefined,
): StoreConversationWhatsAppBridgeRequestKind | null {
  if (
    value?.trim().toLowerCase() !==
    STORE_CONVERSATION_WHATSAPP_PRODUCT_REQUEST_ACTION
  ) {
    return null
  }
  return "commerce_inquiry"
}

export function parseStoreConversationWhatsAppCandidateActionToken(
  value: string,
) {
  const result =
    storeConversationWhatsAppCandidateActionTokenSchema.safeParse(value)
  return result.success ? result.data : null
}

export function isStoreConversationWhatsAppCandidateActionCandidate(
  value: string | undefined,
) {
  return Boolean(value?.startsWith("ewc1_"))
}

function requiredSecret(secret: string) {
  const normalized = secret.trim()
  if (normalized.length < 32) {
    throw new Error(
      "A strong Store Conversation WhatsApp bridge secret is required.",
    )
  }
  return normalized
}

export function getStoreConversationWhatsAppBridgeSecret() {
  return requiredSecret(
    process.env.STORE_CONVERSATION_WHATSAPP_BRIDGE_SECRET ?? "",
  )
}

export function digestStoreConversationWhatsAppBridgeValue(
  value: string,
  secret: string,
) {
  return createHmac("sha256", requiredSecret(secret))
    .update(`store-conversation-whatsapp-bridge:v1:${value}`)
    .digest("hex")
}

export function deriveStoreConversationWhatsAppBridgeChoiceToken(input: {
  bridgeId: string
  choice: StoreConversationWhatsAppBridgeChoice
  revision: number
  secret: string
}) {
  const digest = createHmac("sha256", requiredSecret(input.secret))
    .update(
      `store-conversation-whatsapp-bridge-choice:v1:${input.bridgeId}:${input.revision}:${input.choice}`,
    )
    .digest("base64url")
  return `ewb1_${digest}`
}

export function deriveStoreConversationWhatsAppCandidateActionToken(input: {
  action: StoreConversationWhatsAppCandidateAction
  candidateId: string
  revision: number
  secret: string
}) {
  const digest = createHmac("sha256", requiredSecret(input.secret))
    .update(
      `store-conversation-whatsapp-candidate-action:v1:${input.candidateId}:${input.revision}:${input.action}`,
    )
    .digest("base64url")
  return `ewc1_${digest}`
}

export function storeConversationWhatsAppBridgeTokenDigest(value: string) {
  return digestStoreConversationWhatsAppBridgeValue(
    value,
    getStoreConversationWhatsAppBridgeSecret(),
  )
}

export function createStoreConversationWhatsAppBridgeTokenServices() {
  const secret = getStoreConversationWhatsAppBridgeSecret()
  return {
    deriveCandidateActionToken: (
      input: Omit<
        Parameters<
          typeof deriveStoreConversationWhatsAppCandidateActionToken
        >[0],
        "secret"
      >,
    ) =>
      deriveStoreConversationWhatsAppCandidateActionToken({ ...input, secret }),
    deriveChoiceToken: (
      input: Omit<
        Parameters<typeof deriveStoreConversationWhatsAppBridgeChoiceToken>[0],
        "secret"
      >,
    ) => deriveStoreConversationWhatsAppBridgeChoiceToken({ ...input, secret }),
    digestToken: (value: string) =>
      digestStoreConversationWhatsAppBridgeValue(value, secret),
  }
}
