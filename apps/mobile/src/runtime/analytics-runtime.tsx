import { createNativeAnalytics } from "@ewatrade/events/native"
import Constants from "expo-constants"
import { randomUUID } from "expo-crypto"
import { useSegments } from "expo-router"
import * as SecureStore from "expo-secure-store"
import { useEffect, useRef } from "react"
import { AppState, Platform } from "react-native"

const keyFor = (key: string) => key.replaceAll(":", ".")
export function AnalyticsRuntime() {
  const segments = useSegments()
  const route = `/${segments
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("["))
    .join("/")}`
  const latestRoute = useRef(route)
  latestRoute.current = route
  const client = useRef<ReturnType<typeof createNativeAnalytics> | null>(null)
  useEffect(() => {
    if (
      __DEV__ ||
      Platform.OS !== "android" ||
      process.env.EXPO_PUBLIC_LOGLY_ENABLED !== "true"
    )
      return
    if (process.env.EXPO_PUBLIC_LOGLY_PROJECT !== "ewatrade-mobile") return
    const endpoint = process.env.EXPO_PUBLIC_LOGLY_ENDPOINT
    if (endpoint !== "https://ewatrade.com/api/analytics/mobile") return
    const analytics = createNativeAnalytics({
      endpoint,
      enabled: true,
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
    analytics.init()
    analytics.trackPageView({ route: latestRoute.current })
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active")
        analytics.trackPageView({ route: latestRoute.current })
      void analytics.flush()
    })
    return () => {
      listener.remove()
      void analytics.flush().finally(() => analytics.destroy())
      client.current = null
    }
  }, [])
  useEffect(() => {
    client.current?.trackPageView({ route })
  }, [route])
  return null
}
