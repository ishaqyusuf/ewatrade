import { createHmac, randomUUID } from "node:crypto"
import { z } from "zod"
import { maskStoreConversationNotificationDestination } from "./store-conversation-notifications"

const protectedPushEndpointSchema = z.discriminatedUnion("kind", [
  z
    .object({
      expoPushToken: z
        .string()
        .trim()
        .regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/),
      kind: z.literal("native_expo"),
    })
    .strict(),
  z
    .object({
      auth: z.string().trim().min(16).max(512),
      endpoint: z.string().url().max(2_048),
      kind: z.literal("web_push"),
      p256dh: z.string().trim().min(16).max(512),
    })
    .strict(),
])

function notificationSecret() {
  const configured =
    process.env.STORE_CONVERSATION_NOTIFICATION_VERIFICATION_SECRET?.trim()
  if (configured && configured.length >= 32) return configured
  if (process.env.NODE_ENV !== "production") {
    return "ewatrade-local-store-conversation-notifications-v1"
  }
  throw new Error(
    "Store Conversation notification verification is unavailable.",
  )
}

function keyedDigest(purpose: string, value: string) {
  return createHmac("sha256", notificationSecret())
    .update(`${purpose}\u0000${value}`)
    .digest("hex")
}

export function createStoreConversationNotificationVerificationId() {
  return randomUUID()
}

export function deriveStoreConversationNotificationVerificationCode(
  verificationId: string,
) {
  if (!verificationId.trim()) {
    throw new Error("A notification verification id is required.")
  }
  const value = createHmac("sha256", notificationSecret())
    .update(`verification-code\u0000${verificationId}`)
    .digest()
    .readUInt32BE(0)
  return String(value % 1_000_000).padStart(6, "0")
}

export function digestStoreConversationNotificationVerificationCode(input: {
  code: string
  verificationId: string
}) {
  return keyedDigest(
    "verification-code-digest",
    `${input.verificationId}\u0000${input.code}`,
  )
}

export function digestStoreConversationNotificationDestination(input: {
  channel: "email" | "whatsapp"
  destination: string
}) {
  const destination =
    input.channel === "email"
      ? input.destination.trim().toLowerCase()
      : input.destination.replace(/\s+/g, "")
  return keyedDigest(`destination:${input.channel}`, destination)
}

export function normalizeStoreConversationNotificationDestination(input: {
  channel: "email" | "whatsapp"
  destination: string
}) {
  return input.channel === "email"
    ? input.destination.trim().toLowerCase()
    : input.destination.replace(/\s+/g, "")
}

export function digestStoreConversationPushEndpoint(value: string) {
  return keyedDigest("push-endpoint", value.trim())
}

export function digestStoreConversationNotificationProviderReference(input: {
  providerKey: string
  providerReference: string
}) {
  return keyedDigest(
    `provider-reference:${input.providerKey}`,
    input.providerReference.trim(),
  )
}

export function serializeStoreConversationPushEndpoint(
  input: z.infer<typeof protectedPushEndpointSchema>,
) {
  const endpoint = protectedPushEndpointSchema.parse(input)
  return JSON.stringify(
    endpoint.kind === "native_expo"
      ? { expoPushToken: endpoint.expoPushToken, kind: endpoint.kind }
      : {
          auth: endpoint.auth,
          endpoint: endpoint.endpoint,
          kind: endpoint.kind,
          p256dh: endpoint.p256dh,
        },
  )
}

export function parseStoreConversationPushEndpoint(value: string) {
  if (!value.trim() || value.length > 4_096) {
    throw new Error("Store Conversation push endpoint is invalid.")
  }
  try {
    return protectedPushEndpointSchema.parse(JSON.parse(value))
  } catch {
    throw new Error("Store Conversation push endpoint is invalid.")
  }
}

export function prepareStoreConversationNotificationVerification(
  input: {
    channel: "email" | "whatsapp"
    destination: string
  },
  dependencies: { protectDestination(value: string): string },
) {
  const destination = normalizeStoreConversationNotificationDestination(input)
  const verificationId = createStoreConversationNotificationVerificationId()
  const code =
    deriveStoreConversationNotificationVerificationCode(verificationId)
  return {
    destinationCiphertext: dependencies.protectDestination(destination),
    destinationDigest: digestStoreConversationNotificationDestination({
      channel: input.channel,
      destination,
    }),
    maskedDestination: maskStoreConversationNotificationDestination({
      channel: input.channel,
      destination,
    }),
    tokenDigest: digestStoreConversationNotificationVerificationCode({
      code,
      verificationId,
    }),
    verificationId,
  }
}
