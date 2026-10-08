import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { InviteCard } from "@/components/mobile/green-till/auth-list"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { SalesRepExampleStage } from "@/components/mobile/green-till/auth-stage"
import type { StaffOnboardingPresentationProps } from "@/components/mobile/staff-onboarding/staff-onboarding-presentation"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

/** 03 Market Preview: finish a staff profile after accepting an invitation. */
export function ClassicStaffOnboardingScreen(
  props: StaffOnboardingPresentationProps,
) {
  return (
    <GreenTillAuthScreen
      title="Finish your profile"
      subtitle="This name shows on the sales you record."
      stage={<SalesRepExampleStage />}
      testID="market-preview-staff"
    >
      <InviteCard
        businessName={props.businessName}
        email={props.email}
        role={props.roleLabel}
      />
      <View className="gap-3">
        <FormField
          autoCapitalize="words"
          variant="green-gate"
          label="Full name"
          onChangeText={props.onChangeName}
          placeholder="Enter your full name"
          value={props.name}
        />
        <FormField
          autoCapitalize="words"
          variant="green-gate"
          label="Name on sales (optional)"
          onChangeText={props.onChangeDisplayName}
          placeholder="A short name, like Musa"
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
      <View className="gap-3.5">
        <ActionButton
          disabled={!props.canSubmit || props.isSubmitting}
          isLoading={props.isSubmitting}
          loadingLabel="Activating"
          onPress={props.onSubmit}
          trailingIcon="ArrowRight"
        >
          Start selling
        </ActionButton>
        <Text className="text-center text-[13px] [-rn-line-height:18] text-muted-foreground">
          Your access stays tied to your own email.
        </Text>
      </View>
    </GreenTillAuthScreen>
  )
}
