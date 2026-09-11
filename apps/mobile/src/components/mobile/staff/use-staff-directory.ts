import { useAuthContext } from "@/hooks/use-auth"
import {
  canManageMobileOperations,
  normalizeMobileRole,
} from "@/lib/mobile-roles"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  mapStaffMember,
  STAFF_RESULT_LIMIT,
  STAFF_SEARCH_LIMIT,
} from "./staff-model"
import { useStaffInvitation } from "./use-staff-invitation"

export function useStaffDirectory(onComplete?: () => void) {
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const role = normalizeMobileRole(profile?.role)
  const canManage =
    canManageMobileOperations(role) &&
    (profile?.status?.toUpperCase() ?? "ACTIVE") === "ACTIVE"
  const canReadBilling = role === "OWNER" || role === "ADMIN"
  const identity =
    profile?.id && profile.businessId
      ? JSON.stringify([profile.id, profile.businessId])
      : null
  const originIdentity = useRef(identity)
  if (!originIdentity.current && identity) originIdentity.current = identity
  const identityChanged = !identity || identity !== originIdentity.current
  const originStore = useRef(profile?.storeId)
  const knownStoreChanged = Boolean(
    originStore.current &&
      profile?.storeId &&
      originStore.current !== profile.storeId,
  )
  const [search, updateSearch] = useState("")
  const setSearch = useCallback(
    (value: string) => updateSearch(value.slice(0, STAFF_SEARCH_LIMIT)),
    [],
  )
  const deferredSearch = useDeferredValue(search.trim())
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled:
        canManage && !identityChanged && !knownStoreChanged && !isOffline,
      retry: false,
    }),
  )
  const storeId = profile?.storeId ?? availability.data?.storeId
  if (!originStore.current && !identityChanged && storeId)
    originStore.current = storeId
  const scope =
    identity && storeId
      ? JSON.stringify([profile?.id, profile?.businessId, storeId])
      : null
  const isCurrentScope = useCallback(() => {
    const active = getSession()?.profile
    return Boolean(
      active &&
        active.id === profile?.id &&
        active.businessId === profile?.businessId &&
        (!active.storeId || active.storeId === storeId) &&
        canManageMobileOperations(active.role) &&
        (active.status?.toUpperCase() ?? "ACTIVE") === "ACTIVE",
    )
  }, [profile?.id, profile?.businessId, storeId])
  const invitation = useStaffInvitation({
    scope,
    storeId,
    canOperate: canManage && !identityChanged && !knownStoreChanged,
    canReadBilling,
    isOffline,
    isCurrentScope,
    onCheckDirectory: setSearch,
    onComplete,
  })
  const blocked = identityChanged || knownStoreChanged || invitation.blocked
  const directory = useQuery(
    trpc.retailOps.staff.queryOptions(
      {
        storeId,
        limit: STAFF_RESULT_LIMIT,
        role: "cashier",
        status: "all",
        search: !isOffline && deferredSearch ? deferredSearch : undefined,
      },
      { enabled: !blocked && !isOffline, retry: false },
    ),
  )
  const subscription = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled: !blocked && !isOffline && canReadBilling,
      retry: false,
    }),
  )
  const rows = useMemo(
    () => (blocked ? [] : (directory.data ?? []).map(mapStaffMember)),
    [blocked, directory.data],
  )
  const snapshot =
    !blocked &&
    canReadBilling &&
    subscription.data?.tenant.id === profile?.businessId
      ? subscription.data
      : undefined
  const entitlement = snapshot?.entitlements.find(
    (item) => item.key === "staff",
  )
  const quotaMessage = !canReadBilling
    ? "Staff allowance is checked when you send. Billing usage is available to the Owner or Admin."
    : subscription.isError
      ? "Staff allowance could not refresh. The server will check eligibility when you send."
      : entitlement && snapshot
        ? `${isOffline ? "Cached · " : ""}${snapshot.plan.name}: ${entitlement.used} of ${entitlement.limit} staff places used across all counted roles. Not the loaded attendant count.${entitlement.isAtLimit ? " New staff may require a plan change; existing invitations can have different eligibility." : ""}`
        : isOffline
          ? "Staff allowance is unavailable offline. Reconnect before inviting."
          : "Staff allowance is not available yet. The server will check eligibility when you send."
  const current = useRef({ blocked, isOffline, isCurrentScope })
  current.current = { blocked, isOffline, isCurrentScope }
  const refreshBusy = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(async () => {
    if (
      refreshBusy.current ||
      current.current.blocked ||
      current.current.isOffline ||
      !current.current.isCurrentScope()
    )
      return
    refreshBusy.current = true
    setRefreshing(true)
    try {
      await Promise.all([
        directory.refetch(),
        ...(canReadBilling ? [subscription.refetch()] : []),
      ])
    } finally {
      refreshBusy.current = false
      if (mounted.current) setRefreshing(false)
    }
  }, [directory.refetch, subscription.refetch, canReadBilling])
  const isLoading =
    !isOffline && (directory.isPending || (!storeId && availability.isPending))
  const scopeChanged =
    identityChanged ||
    knownStoreChanged ||
    Boolean(scope && invitation.blocked && canManage)
  return {
    rows,
    invitation,
    search,
    setSearch,
    isOffline,
    blocked,
    scopeChanged,
    canManage,
    directory,
    availability,
    quotaMessage,
    isLoading,
    refreshing,
    refresh,
    storeId,
    atResultLimit: rows.length === STAFF_RESULT_LIMIT,
    searchPending:
      !isOffline && (search.trim() !== deferredSearch || directory.isFetching),
    // Quota is advisory: the server distinguishes new/restored members from an
    // already-counted pending invitation. Do not disable all sends at the limit.
    canOpenInvite:
      !blocked &&
      !isOffline &&
      !directory.isPending &&
      !directory.isError &&
      !invitation.isPending,
  }
}
