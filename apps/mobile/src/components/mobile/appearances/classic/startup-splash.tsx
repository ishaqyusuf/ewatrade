import { ActionButton } from "@/components/mobile/action-button"
import { BrandMark, BrandWordmark } from "@/components/mobile/brand"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import type { StartupSplashProps } from "@/lib/startup-splash-state"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

export function ClassicStartupSplash(props: StartupSplashProps) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const insets = useSafeAreaInsets()
  const state = props.state ?? "normal"
  const failed = state === "error" || state === "offline"

  return (
    <VariableContextProvider
      value={{
        "--splash-muted": palette.heroMuted,
        "--splash-track": palette.heroLine,
        "--splash-gold": palette.gold,
        "--splash-background": palette.heroTo,
        "--splash-top": insets.top,
        "--splash-bottom": Math.max(insets.bottom, 16),
        "--splash-tagline-bottom": Math.max(insets.bottom + 40, 64),
      }}
    >
      <View
        className="flex-1 bg-[var(--splash-background)]"
        testID={`startup-splash-${state}`}
      >
        <StatusBar style="light" />
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0"
        >
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <Defs>
              <RadialGradient
                id="splash-glow"
                gradientUnits="userSpaceOnUse"
                cx="80"
                cy="15"
                r="120"
                gradientTransform="scale(1 .66667)"
              >
                <Stop offset="0" stopColor={palette.heroHighlight} />
                <Stop offset="0.45" stopColor={palette.heroFrom} />
                <Stop offset="1" stopColor={palette.heroTo} />
              </RadialGradient>
            </Defs>
            <Rect width="100" height="100" fill="url(#splash-glow)" />
          </Svg>
        </View>
        <ScrollView
          bounces={false}
          className="w-full flex-1"
          contentContainerClassName="w-full grow pt-[var(--splash-top)] pb-[var(--splash-bottom)]"
        >
          <View
            accessible
            accessibilityLabel={failed ? "ẸwáTrade" : "ẸwáTrade is opening"}
            accessibilityRole={failed ? "image" : "progressbar"}
            accessibilityState={{ busy: !failed }}
            className="min-h-[260px] flex-1 items-center justify-center gap-[18px]"
          >
            <BrandMark color={palette.brandMark} size={96} />
            <BrandWordmark reverse width={125} />
          </View>
          {failed ? (
            <View className="mx-3.5 mb-3.5 gap-3.5 rounded-3xl bg-card p-[18px]">
              <View accessibilityRole="alert" className="gap-1">
                <Text className="text-base font-extrabold text-foreground [-rn-line-height:24]">
                  {state === "offline"
                    ? "You’re offline"
                    : "We couldn’t check your access"}
                </Text>
                <Text className="text-[13px] text-muted-foreground [-rn-line-height:20]">
                  {state === "offline"
                    ? "We’ll open your business once we can confirm your access."
                    : "You’re signed in. Check your connection and try again."}
                </Text>
              </View>
              <ActionButton
                icon="RefreshCw"
                onPress={props.onRetry}
                testID="startup-access-retry"
              >
                Try again
              </ActionButton>
            </View>
          ) : null}
        </ScrollView>
        {!failed ? (
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="absolute inset-x-6 bottom-[var(--splash-tagline-bottom)] items-center gap-6"
          >
            {state === "busy" ? (
              <View className="h-1 w-[120px] overflow-hidden rounded-full bg-[var(--splash-track)]">
                <View className="h-1 w-[54px] rounded-full bg-[var(--splash-gold)]" />
              </View>
            ) : null}
            <Text className="text-center text-[13px] font-bold tracking-[1.04px] text-[var(--splash-muted)] [-rn-line-height:20]">
              COME. TRADE. TOGETHER.
            </Text>
          </View>
        ) : null}
      </View>
    </VariableContextProvider>
  )
}
