import { HomeGuidedJourneyQaScreen } from "@/components/mobile/home-guided-journey-qa-screen"
import {
  HOME_GUIDED_JOURNEY_QA_STATES,
  type HomeGuidedJourneyQaState,
} from "@/lib/home-guided-journey-qa"
import { Redirect, useLocalSearchParams } from "expo-router"

export default function HomeGuidedJourneyQaRoute() {
  const { state, theme, scope } = useLocalSearchParams<{
    state?: string
    theme?: string
    scope?: string
  }>()
  if (
    !__DEV__ ||
    !HOME_GUIDED_JOURNEY_QA_STATES.some((candidate) => candidate === state)
  )
    return <Redirect href="/design-system" />
  return (
    <HomeGuidedJourneyQaScreen
      key={`${state}-${theme}-${scope}`}
      state={state as HomeGuidedJourneyQaState}
      theme={theme === "dark" ? "dark" : "light"}
      scope={scope ?? "a"}
    />
  )
}
