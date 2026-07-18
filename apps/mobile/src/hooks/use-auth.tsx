import {
  type MobileProfile,
  type MobileSession,
  deleteSession,
  getSession,
  setSession,
} from "@/lib/session-store"
import { useBusinessStore } from "@/store/businessStore"
import { useRouter } from "expo-router"
import { createContext, useContext, useEffect, useState } from "react"

type AuthContextProps = ReturnType<typeof useCreateAuthContext>
export const AuthContext = createContext<AuthContextProps | undefined>(
  undefined,
)
export const AuthProvider = AuthContext.Provider

type LocalAuthInput = Partial<MobileProfile>

const createLocalSession = (input: LocalAuthInput = {}): MobileSession => {
  const email = input.email?.trim() ?? ""
  const name = input.name?.trim() || "Store Owner"
  const businessName = input.businessName?.trim() || "My Business"
  const business = useBusinessStore.getState().ensureBusiness({
    currency: input.currencyCode,
    name: businessName,
  })

  return {
    token: `local-${Date.now()}`,
    profile: {
      businessId: input.businessId ?? business.id,
      id: input.id ?? "local-owner",
      name,
      email,
      businessName: business.name,
      currencyCode: business.currency,
      role: input.role ?? "OWNER",
      status: input.status ?? "ACTIVE",
    },
  }
}

export const useCreateAuthContext = () => {
  const [session, setSessionState] = useState<MobileSession | null>(
    getSession(),
  )
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!session || !pendingRedirect) return

    router.replace(pendingRedirect as never)
    setPendingRedirect(null)
  }, [pendingRedirect, router, session])

  const applySession = (
    nextSession: MobileSession,
    redirectHref = "/dashboard",
  ) => {
    setSession(nextSession)
    setSessionState(nextSession)
    setPendingRedirect(redirectHref)
  }

  return {
    session,
    profile: session?.profile ?? null,
    token: session?.token ?? null,
    isAuthenticated: !!session?.token,
    applyAuthenticatedSession(
      nextSession: MobileSession,
      redirectHref?: string,
    ) {
      applySession(nextSession, redirectHref)
    },
    signInLocal(input?: LocalAuthInput) {
      applySession(createLocalSession(input))
    },
    signUpLocal(input?: LocalAuthInput) {
      applySession(createLocalSession(input))
    },
    signOutLocal() {
      void deleteSession()
      setSessionState(null)
      router.replace("/login")
    },
    onLogout() {
      void deleteSession()
      setSessionState(null)
      router.replace("/login")
    },
  }
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuthContext must be used within a AuthProvider")
  }
  return context
}
