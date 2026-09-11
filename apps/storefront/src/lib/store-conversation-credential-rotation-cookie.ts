import "server-only"

import { randomUUID } from "node:crypto"
import type { StagedStoreConversationGuestRotation } from "./store-conversation-credential-rotation-codec"

export {
  parseStagedStoreConversationGuestRotation,
  parseStoreConversationGuestIssuedAt,
  serializeStagedStoreConversationGuestRotation,
} from "./store-conversation-credential-rotation-codec"

export const STORE_CONVERSATION_GUEST_ROTATION_COOKIE =
  "ewatrade.store_conversation_guest_rotation"
export const STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE =
  "ewatrade.store_conversation_guest_issued_at"

export const STORE_CONVERSATION_GUEST_ROTATION_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 15 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: true,
}

export const STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 180 * 24 * 60 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: true,
}

export function createStagedStoreConversationGuestRotation(): StagedStoreConversationGuestRotation {
  return {
    clientOperationId: `credential-rotation-${randomUUID()}`,
    targetCredentialToken: `${randomUUID()}${randomUUID()}`.replaceAll("-", ""),
  }
}
