export const STORE_CONVERSATION_LOCAL_DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1_000

export type StoreConversationLocalDraftAttachmentKind =
  | "audio"
  | "document"
  | "image"

export type StoreConversationLocalDraft = {
  attachmentKind: StoreConversationLocalDraftAttachmentKind | null
  expiresAt: number
  text: string
  version: 1
}

export function createStoreConversationLocalDraft(
  input: {
    attachmentKind: StoreConversationLocalDraftAttachmentKind | null
    text: string
  },
  now = Date.now(),
): StoreConversationLocalDraft | null {
  const text = input.text.slice(0, 2_000)
  if (!text.trim() && !input.attachmentKind) return null
  return {
    attachmentKind: input.attachmentKind,
    expiresAt: now + STORE_CONVERSATION_LOCAL_DRAFT_LIFETIME_MS,
    text,
    version: 1,
  }
}

export function parseStoreConversationLocalDraft(
  value: string | null,
  now = Date.now(),
): StoreConversationLocalDraft | null {
  if (!value) return null
  try {
    const candidate = JSON.parse(value) as Partial<StoreConversationLocalDraft>
    if (
      candidate.version !== 1 ||
      typeof candidate.text !== "string" ||
      candidate.text.length > 2_000 ||
      typeof candidate.expiresAt !== "number" ||
      !Number.isFinite(candidate.expiresAt) ||
      candidate.expiresAt <= now ||
      (candidate.attachmentKind !== null &&
        candidate.attachmentKind !== "audio" &&
        candidate.attachmentKind !== "document" &&
        candidate.attachmentKind !== "image")
    ) {
      return null
    }
    return {
      attachmentKind: candidate.attachmentKind,
      expiresAt: candidate.expiresAt,
      text: candidate.text,
      version: 1,
    }
  } catch {
    return null
  }
}

export function storeConversationLocalDraftKey(input: {
  conversationId: string
  publicToken: string
}) {
  return `store-conversation-draft:v1:${input.publicToken}:${input.conversationId}`
}
