import {
  canReadBusinessInForeground,
  qaContextPollInterval,
} from "@/lib/background-query-policy"
import { currentQaToolingFacts } from "@/lib/qa-tooling-state"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { useAuthContext } from "./use-auth"

export function useAuthenticatedQaTools() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const [appState, setAppState] = useState(AppState.currentState)
  const [now, setNow] = useState(Date.now())
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const enabled = canReadBusinessInForeground({
    active: appState === "active",
    authenticated: auth.isAuthenticated,
    businessId: auth.profile?.businessId,
    offline,
  })
  const options = trpc.qaTools.fixtureContext.queryOptions({
    scopeKey: `${auth.profile?.id ?? ""}:${auth.profile?.businessId ?? ""}:${auth.profile?.storeId ?? ""}`,
  })
  const query = useQuery({
    ...options,
    enabled,
    refetchInterval: (query) =>
      qaContextPollInterval(enabled, Boolean(query.state.data)),
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  })

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppState(state)
      setNow(Date.now())
      // Re-enabling the stale query performs one foreground discovery read.
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!query.data || !enabled) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [query.data, enabled])

  function currentFacts(data: typeof query.data) {
    const session = getSession()
    return currentQaToolingFacts({
      active: !offline && AppState.currentState === "active",
      businessId: auth.profile?.businessId,
      data,
      failed: false,
      fetching: false,
      now: Math.max(now, Date.now()),
      sessionMatches:
        auth.isAuthenticated &&
        session?.token === auth.token &&
        session?.profile.id === auth.profile?.id &&
        session?.profile.businessId === auth.profile?.businessId &&
        session?.profile.storeId === auth.profile?.storeId,
      storeId: auth.profile?.storeId,
      userId: auth.profile?.id,
    })
  }

  return {
    fixtureContext:
      query.isError || query.isFetching ? null : currentFacts(query.data),
    isLoading: query.isFetching,
    async refreshFixtureContext() {
      // refetch bypasses React Query's enabled option; guard manual requests too.
      if (!enabled || AppState.currentState !== "active") return null
      const result = await query.refetch()
      return result.isError ? null : currentFacts(result.data)
    },
  }
}
