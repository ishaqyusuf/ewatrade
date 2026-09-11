import { Text } from "@/components/ui/text"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const REFERENCE_WIDTH = 390

export function MarketDayStartupSplash() {
  const insets = useSafeAreaInsets()
  const { height, width } = useWindowDimensions()
  const pulseSize = Math.max(width + 20, 360)
  const variables = {
    "--splash-scale": Math.min(width / REFERENCE_WIDTH, 1.08),
    "--splash-pulse-size": pulseSize,
    "--splash-pulse-left": (width - pulseSize) / 2,
    "--splash-pulse-top": insets.top + 41,
    "--splash-lockup-top": Math.max(
      insets.top + 174,
      Math.min(height * 0.275, 232),
    ),
    "--splash-cut-bottom": -Math.max(94, insets.bottom + 78),
    "--splash-progress-bottom": Math.max(insets.bottom + 23, 35),
  }
  return (
    <VariableContextProvider value={variables}>
      <View
        accessibilityLabel="ẸwáTrade is opening your market"
        accessibilityRole="progressbar"
        className="flex-1 overflow-hidden bg-market-palm"
      >
        <StatusBar style="light" />
        <View
          pointerEvents="none"
          className="absolute left-[var(--splash-pulse-left)] top-[var(--splash-pulse-top)] h-[var(--splash-pulse-size)] w-[var(--splash-pulse-size)] rounded-full border border-market-pulse-line-soft"
        >
          <View className="absolute inset-[55px] rounded-full border border-market-pulse-line">
            <View className="absolute inset-14 rounded-full border border-market-pulse-line bg-market-pulse-core" />
          </View>
        </View>
        <View
          pointerEvents="none"
          className="absolute -right-[33px] top-[119px] size-[124px] rounded-full bg-market-paprika"
        />
        <View
          pointerEvents="none"
          className="absolute -right-[35px] top-[291px] h-[34px] w-[250px] -rotate-[9deg] bg-market-sky"
        />
        <View className="absolute inset-x-0 top-[var(--splash-lockup-top)] z-[4] scale-[var(--splash-scale)] items-center">
          <View className="absolute top-3.5 h-[132px] w-[126px] translate-x-3 -rotate-2 rounded-t-[34px] rounded-bl-[28px] rounded-br-[42px] bg-market-pulse-shadow" />
          <View className="h-[132px] w-[126px] -rotate-2 items-center justify-center rounded-t-[34px] rounded-bl-[28px] rounded-br-[42px] bg-market-marigold">
            <MarketDoorMark />
          </View>
          <Text
            maxFontSizeMultiplier={1.15}
            className="mt-[22px] text-[57px] font-black [-rn-line-height:64] tracking-[-3px] text-market-on-palm"
          >
            ẸwáTrade
          </Text>
          <Text
            maxFontSizeMultiplier={1.25}
            className="mt-[22px] text-[11px] font-black uppercase [-rn-line-height:16] tracking-[2.4px] text-market-canopy-accent"
          >
            Market day, every day
          </Text>
        </View>
        <View
          pointerEvents="none"
          className="absolute -inset-x-10 bottom-[var(--splash-cut-bottom)] h-[235px] -rotate-[4deg] bg-market-canvas"
        />
        <View className="absolute inset-x-8 bottom-[var(--splash-progress-bottom)] z-[5] flex-row items-center gap-2.5">
          <View className="h-[5px] flex-1 overflow-hidden rounded-full bg-market-progress-track">
            <View className="h-[5px] w-[34px] rounded-full bg-market-marigold" />
          </View>
          <Text
            maxFontSizeMultiplier={1.2}
            className="text-[9px] font-black uppercase [-rn-line-height:13] tracking-[1.4px] text-market-ink"
          >
            Opening your market
          </Text>
        </View>
      </View>
    </VariableContextProvider>
  )
}

function MarketDoorMark() {
  return (
    <View className="relative h-[68px] w-[60px] rounded-[9px] border-[6px] border-market-on-marigold">
      <View className="absolute -bottom-1.5 left-[13px] right-[13px] top-3 rounded-[5px] border-4 border-b-0 border-market-on-marigold" />
      <View className="absolute right-2 top-[35px] size-[7px] rounded-full bg-market-on-marigold" />
    </View>
  )
}
