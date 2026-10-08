import { ActionButton } from "@/components/mobile/action-button"
import { AuthActionButton } from "@/components/mobile/auth-header"
import {
  AuthListCard,
  AuthListRow,
  AuthRadio,
} from "@/components/mobile/green-till/auth-list"
import { AuthFlowScreen } from "@/components/mobile/green-till/auth-screen"
import { SetupPreviewStage } from "@/components/mobile/green-till/auth-stage"
import { StatusBanner } from "@/components/mobile/status-banner"

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
  onClose,
  businessName,
}: {
  selected: AgeSelection
  onSelect: (value: AgeSelection) => void
  onContinue: (value: EligibleAgeBand) => void
  /** Leave setup after an under-13 answer. */
  onClose?: () => void
  /** Shown on the stage preview when setup started from an email link. */
  businessName?: string
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
      stage={<SetupPreviewStage businessName={businessName} chips={[]} />}
    >
      <AuthListCard>
        {choices.map((choice) => (
          <AuthListRow
            accessibilityLabel={choice.label}
            accessibilityRole="radio"
            control={<AuthRadio selected={selected === choice.value} />}
            key={choice.value}
            onPress={() => onSelect(choice.value)}
            selected={selected === choice.value}
            title={choice.label}
          />
        ))}
      </AuthListCard>
      {selected === "UNDER_13" ? (
        <>
          <StatusBanner
            icon="Info"
            message="ẸwáTrade accounts aren’t available under 13. You can close setup here."
            tone="warning"
          />
          {onClose ? (
            <ActionButton onPress={onClose} variant="secondary">
              Close setup
            </ActionButton>
          ) : null}
        </>
      ) : (
        <AuthActionButton
          disabled={!selected}
          onPress={continueWithAge}
          trailingIcon="ArrowRight"
        >
          Continue
        </AuthActionButton>
      )}
    </AuthFlowScreen>
  )
}
