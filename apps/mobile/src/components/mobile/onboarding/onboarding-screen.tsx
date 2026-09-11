import { useState } from "react"
import { useRouter } from "expo-router"
import { ClassicOnboardingScreen } from "@/components/mobile/appearances/classic/onboarding-screen"
import { MarketDayOnboardingScreen } from "@/components/mobile/appearances/market-day/onboarding-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useOnboardingStore } from "@/store/onboardingStore"
import { ONBOARDING_STEPS } from "./onboarding-presentation"

export function OnboardingScreen() {
  const router = useRouter()
  const design = useMobileDesign("onboarding")
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const [stepIndex, setStepIndex] = useState(0)
  const Presentation =
    design === "market-day"
      ? MarketDayOnboardingScreen
      : ClassicOnboardingScreen
  function finish() {
    completeOnboarding(true)
    router.replace("/login")
  }
  function next() {
    if (stepIndex === ONBOARDING_STEPS.length - 1) finish()
    else
      setStepIndex((current) =>
        Math.min(current + 1, ONBOARDING_STEPS.length - 1),
      )
  }
  return (
    <Presentation stepIndex={stepIndex} onContinue={next} onFinish={finish} />
  )
}
