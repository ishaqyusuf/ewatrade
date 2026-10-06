import { OnboardingContinuationScreen } from "@/components/mobile/onboarding/onboarding-continuation-screen"
import { useLocalSearchParams } from "expo-router"

export default function OnboardingContinuationRoute() {
  const { attempt } = useLocalSearchParams<{ attempt?: string }>()
  return <OnboardingContinuationScreen key={attempt ?? "resume"} />
}
