import * as SecureStore from "expo-secure-store"

const QA_AUTHORIZATION_KEY = "ewatrade_qa_authorization_v1"
const QA_CLIENT_ID_KEY = "ewatrade_qa_client_id_v1"

export type StoredQaAuthorization = {
  expiresAt: string
  qaDomain: string
  testerIdentity: string
  token: string
}

export function getStoredQaAuthorization() {
  const value = SecureStore.getItem(QA_AUTHORIZATION_KEY)
  if (!value) return null
  try {
    return JSON.parse(value) as StoredQaAuthorization
  } catch {
    SecureStore.deleteItemAsync(QA_AUTHORIZATION_KEY).catch(() => undefined)
    return null
  }
}

export function setStoredQaAuthorization(value: StoredQaAuthorization) {
  SecureStore.setItem(QA_AUTHORIZATION_KEY, JSON.stringify(value))
}

export function clearStoredQaAuthorization() {
  return SecureStore.deleteItemAsync(QA_AUTHORIZATION_KEY)
}

export function getStoredQaClientId() {
  return SecureStore.getItem(QA_CLIENT_ID_KEY)
}

export function setStoredQaClientId(value: string) {
  SecureStore.setItem(QA_CLIENT_ID_KEY, value)
}

export function clearStoredQaClientId() {
  return SecureStore.deleteItemAsync(QA_CLIENT_ID_KEY)
}
