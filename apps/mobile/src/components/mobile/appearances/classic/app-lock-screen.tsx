import { MobileScreen } from "@/components/mobile/screen"
import type { AppLockPresentationProps } from "@/components/mobile/app-lock/app-lock-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"

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
              <Icon className="size-sm text-muted-foreground" name="X" />
            </Pressable>
          </View>
        ) : null}
        {mode === "entry" ? (
          <View
            accessibilityLabel="Six digit PIN selected. Four digit PIN unavailable."
            className="w-full max-w-[250px] flex-row self-center rounded-full bg-muted p-1"
          >
            <View className="min-h-8 flex-1 items-center justify-center rounded-full px-2 py-1 opacity-50">
              <Text className="text-center text-xs font-medium text-muted-foreground">
                4 digit code
              </Text>
            </View>
            <View className="min-h-8 flex-1 items-center justify-center rounded-full bg-card px-2 py-1">
              <Text className="text-center text-xs font-semibold text-foreground">
                6 digit code
              </Text>
            </View>
          </View>
        ) : null}
        <View className="items-center gap-3">
          {mode === "manage" ? (
            <View className="size-16 items-center justify-center rounded-full bg-muted">
              <Icon className="size-xl text-foreground" name="Lock" />
            </View>
          ) : null}
          <Text
            accessibilityRole="header"
            className="text-center text-[20px] font-semibold [-rn-line-height:28] text-foreground"
          >
            {title}
          </Text>
          <Text className="max-w-[280px] text-center text-xs [-rn-line-height:20] text-muted-foreground">
            {subtitle}
          </Text>
        </View>
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
