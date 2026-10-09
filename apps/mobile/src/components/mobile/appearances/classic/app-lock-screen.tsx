import type { AppLockPresentationProps } from "@/components/mobile/app-lock/app-lock-presentation"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { SettingsScreen } from "../../settings-screen"

export function ClassicAppLockScreen({
  mode,
  title,
  subtitle,
  onClose,
  pinpad,
  feedback,
  recovery,
  management,
}: AppLockPresentationProps) {
  const { colorScheme } = useColorScheme()
  return (
    <MobileScreen
      contentClassName="justify-between gap-7"
      keyboardBottomOffset={24}
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <View className="gap-7">
        {onClose ? (
          <View className="flex-row items-center justify-between">
            <View className="size-11" />
            <Text className="text-center text-[13px] font-medium text-muted-foreground">
              PIN code
            </Text>
            <Pressable
              accessibilityLabel="Close app lock settings"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted active:bg-accent"
              haptic
              onPress={onClose}
            >
              <Icon className="size-[20px] text-muted-foreground" name="X" />
            </Pressable>
          </View>
        ) : null}
        {mode === "manage" ? (
          <SettingsScreen title={title} sub={subtitle} />
        ) : (
          <View className="items-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-center text-2xl font-extrabold text-foreground"
            >
              {title}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {subtitle}
            </Text>
            <Text className="text-xs text-muted-foreground">
              6 digit PIN · stored only on this phone
            </Text>
          </View>
        )}
      </View>
      {mode === "manage" ? (
        management
      ) : (
        <View className="items-center gap-5 pb-5">
          {pinpad}
          {feedback}
          {recovery}
        </View>
      )}
    </MobileScreen>
  )
}
