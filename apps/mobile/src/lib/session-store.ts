import * as SecureStore from "expo-secure-store"

export const SESSION_KEY = "ewatrade_mobile_session"

export type MobileProfile = {
  businessId?: string
  id: string
  name: string
  email: string
  businessName?: string
  businessSlug?: string
  currencyCode?: string
  role?: string
  status?: string
}

export type MobileSession = {
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

export const setSession = (session: MobileSession) =>
  SecureStore.setItem(SESSION_KEY, JSON.stringify(session))

export const deleteSession = () => SecureStore.deleteItemAsync(SESSION_KEY)

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
