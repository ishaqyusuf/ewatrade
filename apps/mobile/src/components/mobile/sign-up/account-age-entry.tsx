import {
  AccountAgePresentation,
  type AgeSelection,
  type EligibleAgeBand,
} from "@/components/mobile/green-till/age-screen"
import { useState } from "react"
import type { ApprovedNativeOnboarding } from "../onboarding/onboarding-continuation-screen"
import { SignUpScreen } from "./sign-up-screen"

export function AccountAgeEntry({
  continuation,
}: { continuation?: ApprovedNativeOnboarding } = {}) {
  const [selected, setSelected] = useState<AgeSelection>(null)
  const [ageBand, setAgeBand] = useState<EligibleAgeBand | null>(null)
  if (ageBand)
    return <SignUpScreen ageBand={ageBand} continuation={continuation} />
  return (
    <AccountAgePresentation
      selected={selected}
      onSelect={setSelected}
      onContinue={setAgeBand}
    />
  )
}
