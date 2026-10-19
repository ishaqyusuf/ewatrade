import { useAuthContext } from "@/hooks/use-auth"
import {
  type MobileSession,
  getSession,
  getSessionGeneration,
} from "@/lib/session-store"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import type { EventMetadata } from "@ewatrade/events/metadata"
import {
  type MobileActivityInput,
  mobileActivityEvent,
} from "@ewatrade/events/mobile-activity"
import { canInitializeMobileAnalytics } from "@ewatrade/events/mobile-policy"
import { createNativeAnalytics } from "@ewatrade/events/native"
import { useQuery } from "@tanstack/react-query"
import Constants from "expo-constants"
import { randomUUID } from "expo-crypto"
import { useSegments } from "expo-router"
import * as SecureStore from "expo-secure-store"
import { useEffect, useRef } from "react"
import { AppState, Platform } from "react-native"

let activeClient: ReturnType<typeof createNativeAnalytics> | null = null
export function trackProductEvent(
  name: string,
  properties: EventMetadata = {},
) {
  activeClient?.track(name, properties)
}

/** Product activity is observational; collection failure cannot change a write. */
export function trackMobileActivity(input: MobileActivityInput) {
  try {
    const event = mobileActivityEvent(input)
    if (event) activeClient?.track(event.name, event.properties)
  } catch {
    // Keep business operations independent of analytics, including its adapter.
  }
}

const keyFor = (key: string) => key.replaceAll(":", ".")

// Memory-only ownership proof. Raw session tokens never enter event metadata,
// query keys, storage or transport through this value.
function sessionLifetime(session: MobileSession | null, generation: number) {
  if (!session?.token || !session.profile?.id) return null
  const profile = session.profile
  return JSON.stringify([
    session.token,
    profile.id,
    profile.businessId ?? null,
    profile.storeId ?? null,
    profile.role ?? null,
    profile.staffAccessMode ?? null,
    profile.status ?? null,
    session.accessProfile?.hasBusinessAccess ?? null,
    generation,
    getSessionGeneration(),
  ])
}

function liveSessionLifetime() {
  try {
    return sessionLifetime(getSession(), getDataCacheGeneration())
  } catch {
    return null
  }
}

export function AnalyticsRuntime() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const sessionOwner = auth.profile?.id
  const cacheGeneration = getDataCacheGeneration()
  const ownerLifetime = sessionLifetime(auth.session, cacheGeneration)
  const ownerGeneration = useRef({ lifetime: ownerLifetime, value: 0 })
  if (ownerGeneration.current.lifetime !== ownerLifetime)
    ownerGeneration.current = {
      lifetime: ownerLifetime,
      value: ownerGeneration.current.value + 1,
    }
  const enabled = canInitializeMobileAnalytics({
    development: __DEV__,
    platform: Platform.OS,
    environment: Constants.expoConfig?.extra?.mobileAnalyticsEnvironment,
    enabled: process.env.EXPO_PUBLIC_LOGLY_ENABLED,
    project: process.env.EXPO_PUBLIC_LOGLY_PROJECT,
    endpoint: process.env.EXPO_PUBLIC_LOGLY_ENDPOINT,
    authenticated:
      auth.isAuthenticated && Boolean(sessionOwner) && ownerLifetime !== null,
  })
  const identityOptions = trpc.tenant.analyticsContext.queryOptions()
  const identityCacheArgs = {
    ...identityOptions.queryKey[1],
    // Cache metadata only. Keep tRPC's path/input tuple intact for transport.
    mobileAnalyticsOwner: {
      actorId: sessionOwner,
      businessId: auth.profile?.businessId,
      lifetimeGeneration: ownerGeneration.current.value,
      cacheGeneration,
    },
  }
  const identity = useQuery({
    ...identityOptions,
    // Local query ownership only: never reuse a previous account/business proof.
    queryKey: [identityOptions.queryKey[0], identityCacheArgs],
    enabled,
    retry: false,
    refetchInterval: 600000,
    staleTime: 0,
  })
  const trackingAllowed =
    enabled &&
    identity.isSuccess &&
    !identity.isFetching &&
    identity.data?.enabled === true
  const permission = useRef(trackingAllowed)
  permission.current = trackingAllowed
  const context = useRef(identity.data?.context)
  context.current = identity.data?.context
  const identityKey = trackingAllowed
    ? (identity.data?.context?.identityKey ?? "anonymous")
    : null
  const segments = useSegments()
  const route = `/${segments
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("["))
    .join("/")}`
  const latestRoute = useRef(route)
  latestRoute.current = route
  const client = useRef<ReturnType<typeof createNativeAnalytics> | null>(null)
  useEffect(() => {
    if (
      !enabled ||
      !identityKey ||
      !sessionOwner ||
      !ownerLifetime ||
      liveSessionLifetime() !== ownerLifetime
    )
      return
    if (process.env.EXPO_PUBLIC_LOGLY_PROJECT !== "ewatrade-mobile") return
    const endpoint = process.env.EXPO_PUBLIC_LOGLY_ENDPOINT
    if (endpoint !== "https://ewatrade.com/api/analytics/mobile") return
    const analytics = createNativeAnalytics({
      endpoint,
      enabled: true,
      permission: () =>
        permission.current && liveSessionLifetime() === ownerLifetime,
      appVersion: Constants.expoConfig?.version,
      appBuild: Constants.nativeBuildVersion ?? undefined,
      createId: randomUUID,
      storage: {
        getItem: (key) => SecureStore.getItem(keyFor(key)),
        setItem: (key, value) => SecureStore.setItem(keyFor(key), value),
        removeItem: (key) => {
          void SecureStore.deleteItemAsync(keyFor(key)).catch(() => {})
        },
      },
    })
    client.current = analytics
    activeClient = analytics
    analytics.init()
    analytics.setContext(context.current ?? null)
    analytics.trackPageView({ route: latestRoute.current })
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active")
        analytics.trackPageView({ route: latestRoute.current })
      void analytics.flush()
    })
    return () => {
      listener.remove()
      analytics.destroy()
      client.current = null
      if (activeClient === analytics) activeClient = null
    }
  }, [enabled, identityKey, sessionOwner, ownerLifetime])
  useEffect(() => {
    client.current?.setContext(identity.data?.context ?? null)
  }, [identity.data])
  useEffect(() => {
    client.current?.trackPageView({ route })
  }, [route])
  return null
}
