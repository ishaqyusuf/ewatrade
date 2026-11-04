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
  /** The business's country (ISO code) from the server, when recorded. */
  countryCode?: string
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

// Reading the Keystore is slow and getSession runs inside renders, so the
// stored string is kept in memory. Only this module writes the key; each call
// still parses a fresh object.
let storedSession: { value: string | null } | null = null

export const getSession = (): MobileSession | null => {
  storedSession ??= { value: SecureStore.getItem(SESSION_KEY) }
  const value = storedSession.value
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
  const value = JSON.stringify(session)
  storedSession = null
  SecureStore.setItem(SESSION_KEY, value)
  storedSession = { value }
}

export const deleteSession = () => {
  // Retire captures synchronously, before the asynchronous native deletion.
  sessionGeneration++
  storedSession = { value: null }
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
