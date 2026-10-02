import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { EventMetadata } from "@ewatrade/events/metadata"
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

const keyFor = (key: string) => key.replaceAll(":", ".")
export function AnalyticsRuntime() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const enabled =
    !__DEV__ &&
    Platform.OS === "android" &&
    process.env.EXPO_PUBLIC_LOGLY_ENABLED === "true" &&
    auth.isAuthenticated
  const identity = useQuery({
    ...trpc.tenant.analyticsContext.queryOptions(),
    enabled,
    retry: false,
    refetchInterval: 600000,
    staleTime: 0,
  })
  const trackingAllowed = identity.isSuccess && identity.data?.enabled === true
  const permission = useRef(trackingAllowed)
  permission.current = trackingAllowed
  const context = useRef(identity.data?.context)
  context.current = identity.data?.context
  const sessionOwner = auth.profile?.id
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
    if (!enabled || !identityKey || !sessionOwner) return
    if (process.env.EXPO_PUBLIC_LOGLY_PROJECT !== "ewatrade-mobile") return
    const endpoint = process.env.EXPO_PUBLIC_LOGLY_ENDPOINT
    if (endpoint !== "https://ewatrade.com/api/analytics/mobile") return
    const analytics = createNativeAnalytics({
      endpoint,
      enabled: true,
      permission: () => permission.current,
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
  }, [enabled, identityKey, sessionOwner])
  useEffect(() => {
    client.current?.setContext(identity.data?.context ?? null)
  }, [identity.data])
  useEffect(() => {
    client.current?.trackPageView({ route })
  }, [route])
  return null
}
