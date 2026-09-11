import { useAuthContext } from "@/hooks/use-auth"
import { canManageMobileOperations } from "@/lib/mobile-roles"
import { getSession, isLocalSessionToken } from "@/lib/session-store"
import { switchMobileBusinessSession } from "@/lib/workspace-feature-availability"
import { useBusinessStore, type RetailOpsBusiness } from "@/store/businessStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Keyboard } from "react-native"
import { getBusinessSwitchRowPresentation } from "../business-switch-presentation"

export const BUSINESS_SEARCH_LIMIT = 160
type SwitchOptions = {
  onComplete?: () => void
  beforeCreate?: (navigate: () => void) => void
}

export function useBusinessSwitch({
  onComplete,
  beforeCreate,
}: SwitchOptions = {}) {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const localBusinesses = useBusinessStore((state) => state.businesses)
  const localHydrated = useBusinessStore((state) => state.hasHydrated)
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const local = isLocalSessionToken(auth.token)
  const identity = auth.profile
    ? JSON.stringify([
        auth.profile.id,
        auth.profile.businessId,
        auth.profile.storeId,
        local,
      ])
    : null
  const origin = useRef(identity)
  if (!origin.current && identity) origin.current = identity
  const canManage =
    canManageMobileOperations(auth.profile?.role) &&
    (auth.profile?.status?.toUpperCase() ?? "ACTIVE") === "ACTIVE"
  const scopeChanged = !identity || identity !== origin.current
  const blocked = scopeChanged || !canManage || !auth.session
  const [search, updateSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const busy = useRef(false)
  const activationEpoch = useRef(0)
  const acceptedRef = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const memberships = useQuery(
    trpc.tenant.businesses.queryOptions(undefined, {
      enabled: !blocked && !local && !isOffline && !accepted,
      retry: false,
      // An activation-time refresh must fail promptly rather than queue across
      // a later account/session change when the device regains connectivity.
      networkMode: "always",
    }),
  )
  const businesses = useMemo<RetailOpsBusiness[]>(
    () =>
      blocked
        ? []
        : local
          ? localBusinesses
          : (memberships.data ?? []).map((business) => ({
              createdAt: "",
              id: business.id,
              name: business.name,
              role: business.role,
              currency: business.currencyCode,
              slug: business.slug,
              type: "Business",
            })),
    [blocked, local, localBusinesses, memberships.data],
  )
  const currentBusinessId = auth.profile?.businessId
  const normalizedSearch = search.trim().toLowerCase()
  const filteredBusinesses = useMemo(
    () =>
      businesses.filter((business) =>
        [
          business.name,
          business.role,
          getBusinessSwitchRowPresentation(business, currentBusinessId).detail,
          business.type,
          business.currency,
          business.country,
          business.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      ),
    [businesses, normalizedSearch, currentBusinessId],
  )
  const latest = useRef({ auth, local, blocked, beforeCreate, onComplete })
  latest.current = { auth, local, blocked, beforeCreate, onComplete }

  const currentSession = useCallback(() => {
    const session = getSession()
    if (!mounted.current || latest.current.blocked || !session) return null
    const key = JSON.stringify([
      session.profile.id,
      session.profile.businessId,
      session.profile.storeId,
      isLocalSessionToken(session.token),
    ])
    if (
      key !== origin.current ||
      !canManageMobileOperations(session.profile.role) ||
      (session.profile.status?.toUpperCase() ?? "ACTIVE") !== "ACTIVE"
    )
      return null
    return session
  }, [])

  async function activateBusiness(id: string) {
    const initial = currentSession()
    if (!initial || busy.current || id === initial.profile.businessId) return
    if (
      !latest.current.local &&
      useOperationalModeStore.getState().isOfflineMode
    )
      return
    if (latest.current.local && !useBusinessStore.getState().hasHydrated) return
    busy.current = true
    const epoch = ++activationEpoch.current
    setSelectingId(id)
    setError(null)
    setNotice(null)
    let applied = false
    try {
      let target: RetailOpsBusiness | undefined
      if (latest.current.local) {
        target = useBusinessStore
          .getState()
          .businesses.find((business) => business.id === id)
      } else {
        const refreshed = await memberships.refetch({ throwOnError: true })
        const member = refreshed.data?.find((business) => business.id === id)
        if (member)
          target = {
            createdAt: "",
            id: member.id,
            name: member.name,
            slug: member.slug,
            role: member.role,
            currency: member.currencyCode,
            type: "Business",
          }
      }
      const session = currentSession()
      if (
        epoch !== activationEpoch.current ||
        !session ||
        (!latest.current.local &&
          useOperationalModeStore.getState().isOfflineMode)
      )
        return
      if (
        !target ||
        (!latest.current.local && (!target.slug || !target.role))
      ) {
        setError(
          "This workspace is no longer available in the current list. Refresh and choose another business. Your session was not switched.",
        )
        return
      }
      const chosen = latest.current.local
        ? { ...target, role: target.role ?? session.profile.role }
        : target
      const next = switchMobileBusinessSession(session, chosen)
      Keyboard.dismiss()
      latest.current.auth.applyAuthenticatedSession(next)
      applied = true
      acceptedRef.current = true
      if (mounted.current) setAccepted(true)
      // Auth/session application is the switch. Cache/callback follow-up must
      // never turn that accepted transition into another activation attempt.
      try {
        if (latest.current.local)
          useBusinessStore.getState().setActiveBusiness(chosen.id)
        latest.current.onComplete?.()
      } catch {
        if (mounted.current)
          setNotice(
            "Workspace selected. Close this screen to continue; a local follow-up could not finish.",
          )
      }
    } catch {
      if (
        epoch === activationEpoch.current &&
        mounted.current &&
        currentSession()
      )
        setError(
          "The workspace could not be verified or selected. Reconnect and try again; no selection is confirmed.",
        )
    } finally {
      if (!applied && epoch === activationEpoch.current) {
        busy.current = false
        if (mounted.current) setSelectingId(null)
      }
    }
  }

  const cancelActivation = useCallback(() => {
    if (acceptedRef.current) return
    activationEpoch.current += 1
    busy.current = false
    if (mounted.current) setSelectingId(null)
  }, [])
  useFocusEffect(useCallback(() => cancelActivation, [cancelActivation]))

  const refresh = useCallback(async () => {
    if (
      !currentSession() ||
      busy.current ||
      latest.current.local ||
      useOperationalModeStore.getState().isOfflineMode
    )
      return
    setError(null)
    try {
      await memberships.refetch({ throwOnError: true })
    } catch {
      if (mounted.current && currentSession())
        setError("Workspaces could not refresh. Reconnect and try again.")
    }
  }, [currentSession, memberships.refetch])

  function openCreate() {
    if (
      !currentSession() ||
      busy.current ||
      (!latest.current.local &&
        useOperationalModeStore.getState().isOfflineMode)
    )
      return
    const navigate = () => {
      if (
        !currentSession() ||
        (!latest.current.local &&
          useOperationalModeStore.getState().isOfflineMode)
      )
        return
      Keyboard.dismiss()
      router.push("/new-business-onboarding-modal")
    }
    Keyboard.dismiss()
    if (latest.current.beforeCreate) latest.current.beforeCreate(navigate)
    else navigate()
  }

  return {
    businesses,
    filteredBusinesses,
    currentBusinessId,
    search,
    setSearch: (value: string) =>
      updateSearch(value.slice(0, BUSINESS_SEARCH_LIMIT)),
    memberships,
    local,
    isOffline,
    scopeChanged,
    blocked,
    canManage,
    error,
    notice,
    selectingId,
    accepted,
    activateBusiness,
    cancelActivation,
    refresh,
    openCreate,
    currentName:
      businesses.find((business) => business.id === currentBusinessId)?.name ??
      auth.profile?.businessName ??
      "Current workspace",
    isLoading: local ? !localHydrated : memberships.isPending && !isOffline,
    canActivate:
      !blocked &&
      !accepted &&
      !selectingId &&
      (local ? localHydrated : !isOffline && !memberships.isPending),
    canCreate:
      !blocked &&
      !accepted &&
      !selectingId &&
      (local ? localHydrated : !isOffline),
  }
}
