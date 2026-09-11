import { Platform } from "react-native"
import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MobileScreen } from "@/components/mobile/screen"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { StaffOnboardingPresentationProps } from "@/components/mobile/staff-onboarding/staff-onboarding-presentation"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"

export function ClassicStaffOnboardingScreen(
  props: StaffOnboardingPresentationProps,
) {
  const largeText = useLargeTextLayout()
  return (
    <MobileScreen
      contentClassName={
        largeText ? "justify-start gap-6" : "justify-center gap-6"
      }
      keyboardAutoScrollEnabled={largeText || Platform.OS !== "android"}
      keyboardBottomOffset={Platform.OS === "android" ? 12 : 48}
    >
      <SecondarySheetHeader
        description="Confirm the name your team will see when you record sales."
        icon="ShieldCheck"
        title="Finish staff setup"
      />
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
          label="Full name"
          leadingIcon="User"
          onChangeText={props.onChangeName}
          placeholder="Enter your full name"
          value={props.name}
        />
        <FormField
          autoCapitalize="words"
          helper="Optional. This can be the short name shown on sales."
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
    </MobileScreen>
  )
}
