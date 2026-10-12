import { ClassicOnboardingScreen } from "@/components/mobile/appearances/classic/onboarding-screen"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ONBOARDING_STEPS } from "./onboarding-presentation"

export function OnboardingScreen() {
  const router = useRouter()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const [stepIndex, setStepIndex] = useState(0)
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
  function previous() {
    setStepIndex((current) => Math.max(current - 1, 0))
  }
  return (
    <ClassicOnboardingScreen
      stepIndex={stepIndex}
      onContinue={next}
      onFinish={finish}
      onPrevious={previous}
    />
  )
}
