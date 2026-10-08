import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { SecondaryOperationalRow } from "@/components/mobile/secondary-operations"
import type { StaffOnboardingPresentationProps } from "@/components/mobile/staff-onboarding/staff-onboarding-presentation"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function ClassicStaffOnboardingScreen(
  props: StaffOnboardingPresentationProps,
) {
  return (
    <GreenTillAuthScreen
      eyebrow="Staff invitation"
      title="Finish staff setup"
      subtitle="Confirm the name your team will see when you record sales."
      testID="green-gate-staff"
    >
      <SecondaryOperationalRow
        className="border-y"
        detail={props.email}
        icon="User"
        metadata="Your role and access stay tied to this account."
        title={props.businessName}
        trailing={
          <StatusBadge
            className="self-start"
            label={props.roleLabel}
            tone="primary"
          />
        }
      />
      <View className="gap-4">
        <FormField
          autoCapitalize="words"
          variant="green-gate"
          label="Full name"
          leadingIcon="User"
          onChangeText={props.onChangeName}
          placeholder="Enter your full name"
          value={props.name}
        />
        <FormField
          autoCapitalize="words"
          helper="Optional. This can be the short name shown on sales."
          variant="green-gate"
          label="Display name"
          leadingIcon="User"
          onChangeText={props.onChangeDisplayName}
          placeholder="Enter your display name"
          value={props.displayName}
        />
        {props.submitError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={props.submitError}
            title="Staff setup failed"
            tone="destructive"
          />
        ) : null}
      </View>
      <View className="gap-3">
        <ActionButton
          disabled={!props.canSubmit || props.isSubmitting}
          isLoading={props.isSubmitting}
          loadingLabel="Activating"
          onPress={props.onSubmit}
        >
          Start selling
        </ActionButton>
        <Text className="text-center text-xs [-rn-line-height:20] text-muted-foreground">
          Your access stays tied to your own email account.
        </Text>
      </View>
    </GreenTillAuthScreen>
  )
}
