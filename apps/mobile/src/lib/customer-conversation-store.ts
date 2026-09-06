import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Crypto from "expo-crypto"
import * as SecureStore from "expo-secure-store"
import { completePendingCustomerTransfer } from "./customer-conversation-state"

const CUSTOMER_SESSION_KEY = "ewatrade_customer_conversation_session_v1"
const CUSTOMER_INSTALLATION_KEY = "ewatrade_customer_installation_v1"
const CUSTOMER_INSTALL_MARKER_KEY = "ewatrade_customer_install_marker_v1"
const CUSTOMER_PENDING_TRANSFER_KEY = "ewatrade_customer_pending_transfer_v1"

export type CustomerConversationSession = {
  credentialExpiresAt: string
  credentialToken: string
  lastConversation?: {
    conversationId: string
    publicToken: string
  }
}

export function getCustomerInstallationToken() {
  const current = SecureStore.getItem(CUSTOMER_INSTALLATION_KEY)
  if (current) return current

  const created = `install-${Crypto.randomUUID()}`
  SecureStore.setItem(CUSTOMER_INSTALLATION_KEY, created)
  return created
}

export function getCustomerConversationSession() {
  const value = SecureStore.getItem(CUSTOMER_SESSION_KEY)
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as CustomerConversationSession
    if (
      !parsed.credentialToken ||
      !parsed.credentialExpiresAt ||
      new Date(parsed.credentialExpiresAt).getTime() <= Date.now()
    ) {
      clearCustomerConversationSession()
      return null
    }
    return parsed
  } catch {
    clearCustomerConversationSession()
    return null
  }
}

export function hasStoredCustomerShellAccess() {
  return getCustomerConversationSession() !== null
}

export function setCustomerConversationSession(
  session: CustomerConversationSession,
) {
  SecureStore.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session))
}

export function updateLastCustomerConversation(input: {
  conversationId: string
  publicToken: string
}) {
  const current = getCustomerConversationSession()
  if (!current) return
  setCustomerConversationSession({ ...current, lastConversation: input })
}

export function updateCustomerConversationExpiry(value: Date | string) {
  const current = getCustomerConversationSession()
  if (!current) return
  setCustomerConversationSession({
    ...current,
    credentialExpiresAt: new Date(value).toISOString(),
  })
}

export function clearCustomerConversationSession() {
  void SecureStore.deleteItemAsync(CUSTOMER_SESSION_KEY)
}

export function clearCustomerInstallationForTests() {
  void SecureStore.deleteItemAsync(CUSTOMER_INSTALLATION_KEY)
}

export type PendingCustomerTransfer = {
  publicToken: string
  targetCredentialToken?: string
  transferToken: string
}

export function setPendingCustomerTransfer(value: PendingCustomerTransfer) {
  const current = getPendingCustomerTransfer()
  const next =
    current?.publicToken === value.publicToken &&
    current.transferToken === value.transferToken &&
    current.targetCredentialToken &&
    !value.targetCredentialToken
      ? { ...value, targetCredentialToken: current.targetCredentialToken }
      : value
  SecureStore.setItem(CUSTOMER_PENDING_TRANSFER_KEY, JSON.stringify(next))
}

export function getPendingCustomerTransfer(publicToken?: string) {
  const value = SecureStore.getItem(CUSTOMER_PENDING_TRANSFER_KEY)
  if (!value) return null
  try {
    const pending = JSON.parse(value) as PendingCustomerTransfer
    if (!pending.publicToken || !pending.transferToken) return null
    if (publicToken && pending.publicToken !== publicToken) return null
    return pending
  } catch {
    clearPendingCustomerTransfer()
    return null
  }
}

export function getOrCreatePendingCustomerTransfer(publicToken: string) {
  const pending = getPendingCustomerTransfer(publicToken)
  if (!pending) return null
  if (pending.targetCredentialToken) return pending

  const completed = completePendingCustomerTransfer(
    pending,
    () =>
      getCustomerConversationSession()?.credentialToken ??
      `mobile-${Crypto.randomUUID()}-${Crypto.randomUUID()}`,
  )
  setPendingCustomerTransfer(completed)
  return completed
}

export function clearPendingCustomerTransfer(publicToken?: string) {
  if (publicToken && !getPendingCustomerTransfer(publicToken)) return
  void SecureStore.deleteItemAsync(CUSTOMER_PENDING_TRANSFER_KEY)
}

/**
 * iOS Keychain data may survive an uninstall. AsyncStorage does not, so this
 * non-secret marker lets a fresh installation discard any residual guest
 * credential before customer routes are rendered.
 */
export async function initializeCustomerConversationStore() {
  const marker = await AsyncStorage.getItem(CUSTOMER_INSTALL_MARKER_KEY)
  if (marker === "present") return

  await SecureStore.deleteItemAsync(CUSTOMER_SESSION_KEY)
  await SecureStore.deleteItemAsync(CUSTOMER_INSTALLATION_KEY)
  await SecureStore.deleteItemAsync(CUSTOMER_PENDING_TRANSFER_KEY)
  await AsyncStorage.setItem(CUSTOMER_INSTALL_MARKER_KEY, "present")
}
