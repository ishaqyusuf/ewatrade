import {
  AuthListCard,
  AuthListRow,
  AuthRadio,
} from "@/components/mobile/green-till/auth-list"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { SetupPreviewStage } from "@/components/mobile/green-till/auth-stage"
import type {
  SignUpCategoriesProps,
  SignUpPresentationProps,
} from "@/components/mobile/sign-up/sign-up-presentation"

export function ClassicSignUpScreen({
  children,
  footer,
  header,
  onBack,
  preview,
  step,
}: SignUpPresentationProps) {
  return (
    <GreenTillAuthScreen
      eyebrow={`Step ${header.step} of 4`}
      title={header.title}
      subtitle={header.subtitle}
      onBack={onBack}
      backLabel={header.step === 1 ? "Back to login" : "Previous step"}
      compact={step !== "account"}
      progress={header.step}
      footer={footer}
      motionKey={step}
      stage={
        <SetupPreviewStage
          businessName={preview?.businessName}
          chips={preview?.chips ?? []}
          ownerLine={preview?.ownerLine}
        />
      }
      testID={`green-gate-setup-${header.step}`}
    >
      {children}
    </GreenTillAuthScreen>
  )
}

export function ClassicSignUpCategories({
  onSelect,
  profiles,
  selectedKey,
}: SignUpCategoriesProps) {
  return (
    <AuthListCard>
      {profiles.map((profile) => (
        <AuthListRow
          accessibilityLabel={`${profile.title}. ${profile.description}`}
          accessibilityRole="radio"
          control={<AuthRadio selected={selectedKey === profile.key} />}
          key={profile.key}
          onPress={() => onSelect(profile)}
          selected={selectedKey === profile.key}
          testID={`business-profile-${profile.key}`}
          title={profile.title}
        />
      ))}
    </AuthListCard>
  )
}
