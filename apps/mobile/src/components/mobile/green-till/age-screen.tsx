import { AuthActionButton } from "@/components/mobile/auth-header"
import { AuthFlowScreen } from "@/components/mobile/green-till/auth-screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export type EligibleAgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
export type AgeSelection = EligibleAgeBand | "UNDER_13" | null
const choices = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
] as const

export function AccountAgePresentation({
  selected,
  onSelect,
  onContinue,
}: {
  selected: AgeSelection
  onSelect: (value: AgeSelection) => void
  onContinue: (value: EligibleAgeBand) => void
}) {
  const continueWithAge = () => {
    if (selected && selected !== "UNDER_13") onContinue(selected)
  }
  return (
    <AuthFlowScreen
      eyebrow="Before you start"
      title="How old are you?"
      subtitle="ẸwáTrade accounts are for people aged 13 or older."
      backHref="/login"
      backLabel="Back to login"
    >
      <View className="overflow-hidden rounded-[20px] bg-muted px-4">
        {choices.map((choice) => (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === choice.value }}
            className="min-h-14 flex-row items-center gap-3 border-b border-border py-3"
            onPress={() => onSelect(choice.value)}
          >
            <View
              className={
                selected === choice.value
                  ? "size-[22px] items-center justify-center rounded-full border-2 border-primary"
                  : "size-[22px] rounded-full border-2 border-border"
              }
            >
              {selected === choice.value ? (
                <View className="size-2.5 rounded-full bg-primary" />
              ) : null}
            </View>
            <Text className="min-w-0 flex-1 text-sm font-semibold [-rn-line-height:21] text-foreground">
              {choice.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {selected === "UNDER_13" ? (
        <StatusBanner
          title="Unable to create an account"
          message="ẸwáTrade accounts are not available to people under 13."
          tone="warning"
        />
      ) : (
        <AuthActionButton
          disabled={!selected}
          onPress={continueWithAge}
        >
          Continue
        </AuthActionButton>
      )}
    </AuthFlowScreen>
  )
}
