import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { APP_LOCK_QUIET_SEAL_LAYOUT } from "@/lib/app-lock-quiet-seal-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type AppLockQuietSealScreenProps = {
  children: ReactNode
  contentClassName?: string
  eyebrow: string
  onClose?: () => void
  subtitle: string
  testID?: string
  title: string
}

export function AppLockQuietSealScreen({
  children,
  contentClassName,
  eyebrow,
  onClose,
  subtitle,
  testID,
  title,
}: AppLockQuietSealScreenProps) {
  const largeText = useLargeTextLayout()
  const palette = useMarketDayPalette()
  const insets = useSafeAreaInsets()
  return (
    <VariableContextProvider
      value={{
        "--lock-safe-top": insets.top,
        "--lock-safe-bottom": insets.bottom,
      }}
    >
      <View className="flex-1 bg-market-paprika pt-[var(--lock-safe-top)]">
        <StatusBar backgroundColor={palette.paprika} style="light" />
        <ScrollView
          className="bg-market-canvas"
          contentContainerClassName="grow bg-market-canvas pb-[var(--lock-safe-bottom)]"
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID={testID}
        >
          <View
            className={cn(
              "relative z-[2] bg-market-paprika",
              largeText ? "h-[195px]" : "h-[177px]",
            )}
          >
            <View className="min-h-14 flex-row items-center gap-3 px-[18px] pt-5">
              <Text
                numberOfLines={largeText ? undefined : 1}
                className="flex-1 text-[10px] font-black uppercase tracking-[1.5px] [-rn-line-height:16] text-market-canopy-accent"
              >
                {eyebrow}
              </Text>
              {onClose ? (
                <Pressable
                  accessibilityLabel="Close app lock settings"
                  accessibilityRole="button"
                  className="size-[42px] items-center justify-center rounded-full bg-white/[0.13] active:bg-white/[0.22]"
                  haptic
                  hitSlop={6}
                  onPress={onClose}
                >
                  <Icon className="size-5 text-market-on-palm" name="X" />
                </Pressable>
              ) : (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="size-[42px]"
                />
              )}
            </View>
            <View
              pointerEvents="none"
              className="absolute -bottom-[42px] -left-[18px] -right-[18px] h-[72px] rotate-[5deg] bg-market-canvas"
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              className="absolute -bottom-[37px] left-1/2 -ml-[62px] size-[124px] items-center justify-center"
            >
              <View className="absolute left-1.5 top-2 size-[115px] rounded-full bg-market-pulse-shadow" />
              <View className="size-[115px] -rotate-[4deg] items-center justify-center rounded-full border-[7px] border-market-canvas bg-market-palm">
                <View className="size-[88px] items-center justify-center rounded-full border border-market-on-palm-muted">
                  <Icon
                    className="size-[39px] text-market-on-palm"
                    name="Lock"
                  />
                </View>
              </View>
            </View>
          </View>
          <View
            className={cn(
              "grow pb-5",
              largeText
                ? "gap-[26px] px-[22px] pt-[98px]"
                : "gap-[22px] px-[26px] pt-[92px]",
              contentClassName,
            )}
          >
            <View className="items-center gap-2">
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
                className={cn(
                  "text-center font-market-display font-black tracking-[-1.2px] text-market-ink",
                  largeText
                    ? "text-[31px] [-rn-line-height:35]"
                    : "text-[33px] [-rn-line-height:34]",
                )}
              >
                {title}
              </Text>
              <Text
                className={cn(
                  "text-center text-xs text-market-muted-ink",
                  largeText
                    ? "max-w-[320px] [-rn-line-height:22]"
                    : "max-w-[286px] [-rn-line-height:18]",
                )}
              >
                {subtitle}
              </Text>
            </View>
            {children}
          </View>
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}

export function AppLockQuietSealLengthChoice() {
  return (
    <View
      accessibilityLabel="Six digit PIN selected. Four digit PIN unavailable."
      className="min-h-[30px] w-full max-w-full flex-row items-center justify-center gap-2 self-center border-y border-market-line px-2.5"
    >
      <Text
        maxFontSizeMultiplier={
          APP_LOCK_QUIET_SEAL_LAYOUT.choiceLabelFontScaleCap
        }
        numberOfLines={2}
        className="flex-1 text-center text-[9px] font-bold uppercase tracking-[0.5px] [-rn-line-height:14] text-market-muted-ink"
      >
        4 digit unavailable
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="size-[5px] rounded-full bg-market-paprika"
      />
      <Text
        maxFontSizeMultiplier={
          APP_LOCK_QUIET_SEAL_LAYOUT.choiceLabelFontScaleCap
        }
        numberOfLines={2}
        className="flex-1 text-center text-[9px] font-black uppercase tracking-[0.5px] [-rn-line-height:14] text-market-ink"
      >
        6 digit selected
      </Text>
    </View>
  )
}

export function AppLockQuietSealDeviceNote({
  children = "Stored only on this phone",
}: { children?: ReactNode }) {
  return (
    <View className="min-h-6 flex-row items-center justify-center gap-[7px]">
      <Icon className="size-[15px] text-market-accent-ink" name="ShieldCheck" />
      <Text
        maxFontSizeMultiplier={2}
        className="shrink text-center text-[10px] font-semibold [-rn-line-height:16] text-market-muted-ink"
      >
        {children}
      </Text>
    </View>
  )
}
