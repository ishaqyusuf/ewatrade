import { currentQaToolingFacts } from "@/lib/qa-tooling-state"
import { getSession } from "@/lib/session-store"
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
  const options = trpc.qaTools.fixtureContext.queryOptions({
    scopeKey: `${auth.profile?.id ?? ""}:${auth.profile?.businessId ?? ""}:${auth.profile?.storeId ?? ""}`,
  })
  const query = useQuery({
    ...options,
    enabled:
      auth.isAuthenticated &&
      Boolean(auth.profile?.businessId) &&
      appState === "active",
    refetchInterval: 45_000,
    retry: false,
    staleTime: 0,
  })

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppState(state)
      setNow(Date.now())
      if (
        state === "active" &&
        auth.isAuthenticated &&
        auth.profile?.businessId
      )
        void query.refetch()
    })
    return () => subscription.remove()
  }, [auth.isAuthenticated, auth.profile?.businessId, query.refetch])

  useEffect(() => {
    if (!query.data) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [query.data])

  function currentFacts(data: typeof query.data) {
    const session = getSession()
    return currentQaToolingFacts({
      active: AppState.currentState === "active",
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
      const result = await query.refetch()
      return result.isError ? null : currentFacts(result.data)
    },
  }
}
