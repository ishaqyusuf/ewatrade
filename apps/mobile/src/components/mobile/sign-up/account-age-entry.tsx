import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"
import type { ApprovedNativeOnboarding } from "../onboarding/onboarding-continuation-screen"
import { SignUpScreen } from "./sign-up-screen"

type EligibleAgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"

const choices: Array<{ label: string; value: EligibleAgeBand | "UNDER_13" }> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

export function AccountAgeEntry({
  continuation,
}: { continuation?: ApprovedNativeOnboarding } = {}) {
  const [selected, setSelected] = useState<EligibleAgeBand | "UNDER_13" | null>(
    null,
  )
  const [ageBand, setAgeBand] = useState<EligibleAgeBand | null>(null)

  if (ageBand)
    return <SignUpScreen ageBand={ageBand} continuation={continuation} />

  return (
    <View className="flex-1 justify-center bg-background p-5">
      <View className="gap-4 rounded-xl border border-border bg-card p-5">
        <Text className="text-xl font-semibold text-foreground">
          Before creating an account
        </Text>
        <Text className="text-sm text-muted-foreground">
          EwaTrade accounts are for people aged 13 or older. Choose your age
          range before entering account or Store details.
        </Text>
        {choices.map((choice) => (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === choice.value }}
            className="min-h-11 flex-row items-center gap-3 rounded-lg border border-border px-3"
            onPress={() => setSelected(choice.value)}
          >
            <Text className="text-foreground">
              {selected === choice.value ? "◉" : "○"} {choice.label}
            </Text>
          </Pressable>
        ))}
        {selected === "UNDER_13" ? (
          <Text className="text-sm text-muted-foreground">
            EwaTrade accounts are not available to people under 13.
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-lg bg-primary px-4"
            disabled={!selected}
            onPress={() => setAgeBand(selected as EligibleAgeBand)}
          >
            <Text className="font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
