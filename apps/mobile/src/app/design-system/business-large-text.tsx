import { BusinessLargeTextQaScreen } from "@/components/mobile/business-large-text-qa-screen"
import { parseBusinessLargeTextQaState } from "@/lib/business-large-text-qa"
import { Redirect, useLocalSearchParams } from "expo-router"

export default function BusinessLargeTextQaRoute() {
  const { qaState, theme } = useLocalSearchParams<{
    qaState?: string | string[]
    theme?: string | string[]
  }>()
  const state = parseBusinessLargeTextQaState({
    development: __DEV__,
    qaState,
  })

  if (!state) return <Redirect href="/design-system" />
  return (
    <BusinessLargeTextQaScreen
      key={`${state}-${theme === "dark" ? "dark" : "light"}`}
      qaState={state}
      theme={theme === "dark" ? "dark" : "light"}
    />
  )
}
