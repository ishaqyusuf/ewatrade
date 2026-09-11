import { MarketDayActionButton } from "@/components/mobile/action-button"
import {
  UpdatesProgress,
  UpdatesStepRow,
} from "@/components/mobile/updates/updates-controls"
import type { AutoUpdatePresentationProps } from "@/components/mobile/updates/updates-presentation"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDayAutoUpdateScreen(model: AutoUpdatePresentationProps) {
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--auto-top": insets.top + 28,
        "--auto-bottom": insets.bottom + 28,
      }}
    >
      <View className="flex-1 bg-market-canvas">
        <StatusBar
          backgroundColor={palette.canvas}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center gap-7 px-6 pt-[var(--auto-top)] pb-[var(--auto-bottom)]"
        >
          <Text className="font-market-mono text-[11px] font-bold uppercase tracking-[1.5px] text-market-muted-ink">
            App updates · Release ticket
          </Text>
          <View
            className="gap-5 border-b-[7px] border-market-marigold bg-market-palm p-6"
            accessibilityLiveRegion="polite"
          >
            <Icon
              name={model.failed ? "AlertCircle" : "Download"}
              className="size-xl text-market-on-palm"
            />
            <Text
              accessibilityRole="header"
              className="font-market-display text-[36px] font-bold text-market-on-palm [-rn-line-height:42]"
            >
              {model.title}
            </Text>
            <Text className="text-base text-market-on-palm-muted [-rn-line-height:24]">
              {model.message}
            </Text>
          </View>
          {model.failed ? (
            <MarketDayActionButton tone="palm" onPress={model.onContinue}>
              Continue
            </MarketDayActionButton>
          ) : (
            <View className="gap-5">
              {model.downloading ? (
                <UpdatesProgress progress={model.progress} market />
              ) : null}
              {model.steps.map((step, index) => (
                <UpdatesStepRow
                  key={step.label}
                  step={step}
                  index={index}
                  market
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
