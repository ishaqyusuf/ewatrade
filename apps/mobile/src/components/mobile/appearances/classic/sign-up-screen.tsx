import { AuthBrandHeader } from "@/components/mobile/auth-header"
import { MobileScreen } from "@/components/mobile/screen"
import type {
  SignUpCategoriesProps,
  SignUpPresentationProps,
} from "@/components/mobile/sign-up/sign-up-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { Platform } from "react-native"

export function ClassicSignUpScreen({
  children,
  footer,
  header,
  onBack,
  step,
}: SignUpPresentationProps) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  return (
    <View className="flex-1 bg-background">
      <MobileScreen
        contentClassName={cn(
          largeText || step === "businessType"
            ? "justify-start gap-7"
            : "justify-center gap-7",
          step === "businessType" && "pb-28",
        )}
        keyboardAutoScrollEnabled={Platform.OS !== "android"}
        keyboardBottomOffset={48}
      >
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            accessibilityLabel={
              header.step === 1 ? "Back to login" : "Previous step"
            }
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full active:bg-muted"
            haptic
            onPress={onBack}
          >
            <Icon className="size-base text-foreground" name="ChevronLeft" />
          </Pressable>
          <Text className="text-xs font-bold text-muted-foreground">
            Step {header.step} of 4
          </Text>
        </View>
        <AuthBrandHeader subtitle={header.subtitle} title={header.title} />
        {children}
      </MobileScreen>
      {footer}
    </View>
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
            "min-h-14 gap-1 border-b border-border px-4 py-4 active:bg-muted",
            selectedKey === profile.key && "bg-primary/10",
          )}
          haptic
          key={profile.key}
          onPress={() => onSelect(profile)}
          testID={`business-profile-${profile.key}`}
        >
          <Text className="font-bold text-foreground">{profile.title}</Text>
          <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
            {profile.description}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
