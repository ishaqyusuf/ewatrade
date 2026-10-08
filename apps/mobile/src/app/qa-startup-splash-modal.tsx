import { ClassicStartupSplash } from "@/components/mobile/appearances/classic/startup-splash"
import { applyThemeOverride } from "@/hooks/use-color"
import { isDevelopmentAppVariant } from "@/lib/app-variant"
import { appThemeRuntime } from "@/lib/theme-runtime"
import { Redirect, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"

// Local-only state fixture: no auth hooks, requests or persisted preferences.
// This lets native QA inspect transient startup states without slowing launches.
export default function StartupSplashQaRoute() {
  const { state, theme } = useLocalSearchParams<{
    state?: string
    theme?: string
  }>()
  if (!__DEV__ || !isDevelopmentAppVariant()) return <Redirect href="/" />
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: "none",
          statusBarStyle: "light",
        }}
      />
      <StartupSplashQa key={`${state}-${theme}`} />
    </>
  )
}

function StartupSplashQa() {
  const { state, theme } = useLocalSearchParams<{
    state?: string
    theme?: string
  }>()
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const previous = appThemeRuntime.getSnapshot()
    if (theme === "light" || theme === "dark") applyThemeOverride(theme)
    return () => applyThemeOverride(previous)
  }, [theme])

  if (retrying) return <ClassicStartupSplash state="busy" />
  if (state === "error" || state === "offline") {
    return (
      <ClassicStartupSplash state={state} onRetry={() => setRetrying(true)} />
    )
  }
  return <ClassicStartupSplash state={state === "busy" ? "busy" : "normal"} />
}
