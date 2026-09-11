import {
  createStoreConversationLocalDraft,
  parseStoreConversationLocalDraft,
  storeConversationLocalDraftKey,
} from "@ewatrade/utils"
import * as Crypto from "expo-crypto"
import * as SecureStore from "expo-secure-store"

type DraftInput = {
  attachmentKind: "audio" | "document" | "image" | null
  conversationId: string
  publicToken: string
  text: string
}

async function storageKey(input: {
  conversationId: string
  publicToken: string
}) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    storeConversationLocalDraftKey(input),
  )
  return `customer_conversation_draft_${digest}`
}

export async function getCustomerConversationDraft(input: {
  conversationId: string
  publicToken: string
}) {
  const key = await storageKey(input)
  const value = parseStoreConversationLocalDraft(
    await SecureStore.getItemAsync(key),
  )
  if (!value) await SecureStore.deleteItemAsync(key)
  return value
}

export async function setCustomerConversationDraft(input: DraftInput) {
  const key = await storageKey(input)
  const value = createStoreConversationLocalDraft(input)
  if (!value) {
    await SecureStore.deleteItemAsync(key)
    return
  }
  await SecureStore.setItemAsync(key, JSON.stringify(value))
}

export async function clearCustomerConversationDraft(input: {
  conversationId: string
  publicToken: string
}) {
  await SecureStore.deleteItemAsync(await storageKey(input))
}
