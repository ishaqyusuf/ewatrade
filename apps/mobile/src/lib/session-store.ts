import * as SecureStore from "expo-secure-store"
import type { MobileAccessProfile } from "./mobile-entry-routing"

export const SESSION_KEY = "ewatrade_mobile_session"

export type MobileProfile = {
  businessId?: string
  id: string
  name: string
  email: string
  businessName?: string
  businessSlug?: string
  currencyCode?: string
  storeId?: string
  storeName?: string
  staffAccessMode?: "LEGACY" | "SCOPED"
  catalogEditor?: boolean
  role?: string
  status?: string
}

export type MobileSession = {
  accessProfile?: MobileAccessProfile
  expiresAt?: string
  token: string
  profile: MobileProfile
}

export const getSession = (): MobileSession | null => {
  const value = SecureStore.getItem(SESSION_KEY)
  if (!value) return null

  try {
    return JSON.parse(value) as MobileSession
  } catch {
    deleteSession()
    return null
  }
}

// Private runtime generation only; no token/session schema or persistence
// changes. Even an identical restored Session is a new observation lifetime.
let sessionGeneration = 0
export const getSessionGeneration = () => sessionGeneration

export const setSession = (session: MobileSession) => {
  sessionGeneration++
  return SecureStore.setItem(SESSION_KEY, JSON.stringify(session))
}

export const deleteSession = () => {
  // Retire captures synchronously, before the asynchronous native deletion.
  sessionGeneration++
  return SecureStore.deleteItemAsync(SESSION_KEY)
}

export const getToken = () => getSession()?.token ?? null

export const isLocalSessionToken = (token: string | null | undefined) =>
  token?.startsWith("local-") ?? false

export const setToken = (token: string) => {
  const existing = getSession()
  setSession({
    token,
    profile:
      existing?.profile ??
      ({
        id: "local-user",
        name: "Local User",
        email: "",
      } satisfies MobileProfile),
  })
}

export const deleteToken = deleteSession
