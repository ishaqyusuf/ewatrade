import { MobileScreen } from "@/components/mobile/screen"
import type { LoginPresentationProps } from "@/components/mobile/login/login-presentation"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { StatusBar } from "expo-status-bar"

export function ClassicLoginScreen({
  actions,
  children,
  footer,
}: LoginPresentationProps) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  return (
    <MobileScreen
      contentClassName={
        largeText ? "justify-start gap-7" : "justify-center gap-7"
      }
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      {actions ? (
        <View className="flex-row justify-end gap-2">{actions}</View>
      ) : null}
      <View className={largeText ? "gap-4" : "items-center gap-5"}>
        <View
          className={
            largeText ? "flex-row items-center gap-3" : "items-center gap-3"
          }
        >
          <View className="size-[54px] items-center justify-center rounded-[18px] bg-primary">
            <Icon className="size-lg text-primary-foreground" name="Wallet" />
          </View>
          <Text className="text-[28px] font-bold [-rn-line-height:32] text-primary">
            ẸwáTrade
          </Text>
        </View>
        <View className={largeText ? "gap-2" : "items-center gap-2"}>
          <Text className="text-xl font-bold [-rn-line-height:24] text-foreground">
            Sign in to your account
          </Text>
          <Text
            className={
              largeText
                ? "text-sm [-rn-line-height:20] text-muted-foreground"
                : "max-w-[280px] text-center text-sm [-rn-line-height:20] text-muted-foreground"
            }
          >
            Sign in once to open your work or Store conversations.
          </Text>
        </View>
      </View>
      {children}
      {footer}
    </MobileScreen>
  )
}
