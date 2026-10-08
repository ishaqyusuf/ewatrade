import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import type {
  SignUpCategoriesProps,
  SignUpPresentationProps,
} from "@/components/mobile/sign-up/sign-up-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"

export function ClassicSignUpScreen({
  children,
  footer,
  header,
  onBack,
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
    <View className="gap-0">
      {profiles.map((profile) => (
        <Pressable
          accessibilityLabel={`${profile.title}. ${profile.description}`}
          accessibilityRole="radio"
          accessibilityState={{ selected: selectedKey === profile.key }}
          className={cn(
            "min-h-14 flex-row items-center gap-3 border-b border-border px-1 py-4 active:bg-muted",
            selectedKey === profile.key && "bg-primary/10",
          )}
          haptic
          key={profile.key}
          onPress={() => onSelect(profile)}
          testID={`business-profile-${profile.key}`}
        >
          <View
            className={cn(
              "size-[22px] shrink-0 items-center justify-center rounded-full border-2",
              selectedKey === profile.key ? "border-primary" : "border-border",
            )}
          >
            {selectedKey === profile.key ? (
              <View className="size-2.5 rounded-full bg-primary" />
            ) : null}
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm font-bold [-rn-line-height:21] text-foreground">
              {profile.title}
            </Text>
            <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
              {profile.description}
            </Text>
          </View>
          <Icon name="ChevronRight" className="size-sm text-muted-foreground" />
        </Pressable>
      ))}
    </View>
  )
}
