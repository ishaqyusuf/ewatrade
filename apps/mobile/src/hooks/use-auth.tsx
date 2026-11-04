import { getCustomerConversationSession } from "@/lib/customer-conversation-store"
import { signInDestinationHref } from "@/lib/mobile-entry-routing"
import {
  SESSION_ENDED_NOTICE,
  subscribeSessionExpired,
} from "@/lib/session-expiry"
import {
  type MobileProfile,
  type MobileSession,
  deleteSession,
  getSession,
  setSession,
} from "@/lib/session-store"
import { useBusinessStore } from "@/store/businessStore"
import { clearMobileDataCache } from "@/trpc/client"
import { useRouter } from "expo-router"
import { createContext, useContext, useEffect, useRef, useState } from "react"

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
    accessProfile: { hasBusinessAccess: true, hasCustomerHistory: false },
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
  const [pendingRedirect, setPendingRedirect] = useState<{
    href: string
    signedIn: boolean
  } | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!session || !pendingRedirect) return

    // A fresh sign-in drops the sign-in screens (login, code, QA businesses)
    // so Back from Home can't return to them.
    if (pendingRedirect.signedIn && router.canDismiss()) router.dismissAll()
    router.replace(pendingRedirect.href as never)
    setPendingRedirect(null)
  }, [pendingRedirect, router, session])

  const endSession = (notice?: typeof SESSION_ENDED_NOTICE) => {
    clearMobileDataCache()
    void deleteSession()
    setSessionState(null)
    setPendingRedirect(null)
    router.replace(
      notice ? { pathname: "/login", params: { notice } } : "/login",
    )
  }

  // A rejected token can never pass the startup checks; return to sign-in.
  const endSessionRef = useRef(endSession)
  endSessionRef.current = endSession
  useEffect(
    () =>
      subscribeSessionExpired((expiredToken) => {
        if (getSession()?.token !== expiredToken) return
        endSessionRef.current(SESSION_ENDED_NOTICE)
      }),
    [],
  )

  const applySession = (
    nextSession: MobileSession,
    redirectHref = "/dashboard",
  ) => {
    if (
      session?.token !== nextSession.token ||
      session.profile.businessId !== nextSession.profile.businessId ||
      session.profile.storeId !== nextSession.profile.storeId ||
      session.profile.role !== nextSession.profile.role ||
      session.profile.staffAccessMode !== nextSession.profile.staffAccessMode ||
      session.profile.catalogEditor !== nextSession.profile.catalogEditor
    ) {
      clearMobileDataCache()
    }
    setSession(nextSession)
    setSessionState(nextSession)
    // Sign-in screens send people to the start route, which shows the splash
    // while it fetches the Access Profile again. The sign-in response already
    // carries it, so go straight to the screen it decides.
    const href =
      redirectHref === "/"
        ? (signInDestinationHref({
            accessProfile: nextSession.accessProfile,
            hasGuestCapability: Boolean(getCustomerConversationSession()),
          }) ?? redirectHref)
        : redirectHref
    setPendingRedirect({ href, signedIn: !session?.token })
  }

  return {
    accessProfile: session?.accessProfile ?? null,
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
    updateAccessProfile(
      accessProfile: NonNullable<MobileSession["accessProfile"]>,
    ) {
      if (!session) return
      const nextSession = { ...session, accessProfile }
      setSession(nextSession)
      setSessionState(nextSession)
    },
    signInLocal(input?: LocalAuthInput) {
      applySession(createLocalSession(input))
    },
    signUpLocal(input?: LocalAuthInput) {
      applySession(createLocalSession(input))
    },
    signOutLocal() {
      endSession()
    },
    onLogout() {
      endSession()
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
