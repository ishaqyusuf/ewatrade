import {
  UpdatesActions,
  UpdatesProgress,
  UpdatesStepRow,
} from "@/components/mobile/updates/updates-controls"
import {
  UPDATE_HELP,
  type UpdatesPresentationProps,
} from "@/components/mobile/updates/updates-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDayUpdatesScreen(model: UpdatesPresentationProps) {
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  const [headerHeight, setHeaderHeight] = useState(0)
  const [pastHeader, setPastHeader] = useState(false)
  return (
    <VariableContextProvider
      value={{
        "--updates-top": insets.top,
        "--updates-bottom": insets.bottom + 32,
      }}
    >
      <View className="flex-1 bg-market-canvas">
        <StatusBar
          animated
          backgroundColor={pastHeader ? palette.canvas : palette.palm}
          style={!pastHeader || colorScheme === "dark" ? "light" : "dark"}
        />
        <View
          pointerEvents="none"
          className={cn(
            "absolute inset-x-0 top-0 z-[100] h-[var(--updates-top)]",
            pastHeader ? "bg-market-canvas" : "bg-market-palm",
          )}
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 pb-[var(--updates-bottom)]"
          scrollEventThrottle={16}
          onScroll={(event) =>
            setPastHeader(
              headerHeight > 0 &&
                event.nativeEvent.contentOffset.y >= headerHeight - insets.top,
            )
          }
        >
          <View
            onLayout={(event) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
            className="gap-5 border-b-[7px] border-market-marigold bg-market-palm px-5 pb-7 pt-[var(--updates-top)]"
          >
            <View className="flex-row items-center gap-3 pt-3">
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                haptic
                onPress={model.onBack}
                className="size-11 items-center justify-center rounded-full border border-market-hero-hairline active:bg-market-hero-pressed"
              >
                <Icon
                  name="ArrowLeft"
                  className="size-base text-market-on-palm"
                />
              </Pressable>
              <Text className="min-w-0 flex-1 font-market-mono text-[11px] uppercase tracking-[1.5px] text-market-on-palm-muted">
                App updates
              </Text>
            </View>
            <Text
              accessibilityRole="header"
              className="font-market-display text-[38px] font-black text-market-on-palm [-rn-line-height:44]"
            >
              Keep your market moving.
            </Text>
            <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
              The latest tools, for the build you’re using.
            </Text>
          </View>
          <View className="gap-6 px-5">
            <View
              className="gap-3 border-l-4 border-market-marigold bg-market-field p-4"
              accessibilityLiveRegion="polite"
            >
              <Text className="font-market-mono text-[10px] font-bold uppercase tracking-[1.4px] text-market-muted-ink">
                Release ticket
              </Text>
              <Text className="font-market-display text-[28px] font-bold text-market-ink [-rn-line-height:34]">
                {model.status}
              </Text>
              <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
                {model.message}
              </Text>
              {model.downloading ? (
                <UpdatesProgress progress={model.progress} market />
              ) : null}
            </View>
            {model.errorMessage ? (
              <Text
                accessibilityRole="alert"
                className="border-l-2 border-market-paprika bg-market-field p-3 text-sm text-market-ink [-rn-line-height:21]"
              >
                {model.errorMessage}
              </Text>
            ) : null}
            <View className="gap-4">
              {model.steps.map((step, index) => (
                <UpdatesStepRow
                  key={step.label}
                  step={step}
                  index={index}
                  market
                />
              ))}
            </View>
            <UpdatesActions model={model} market />
            <View>
              <Text
                accessibilityRole="header"
                className="mb-3 font-market-mono text-[11px] font-bold uppercase tracking-[1.4px] text-market-muted-ink"
              >
                This installation
              </Text>
              <View className="border-t border-market-line">
                {model.info.map((row) => (
                  <View
                    key={row.label}
                    className="flex-row items-start gap-4 border-b border-market-line py-3"
                  >
                    <Text className="flex-1 text-sm text-market-muted-ink">
                      {row.label}
                    </Text>
                    <Text className="min-w-0 flex-1 text-right text-sm font-semibold text-market-ink">
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View className="gap-2">
              <Text className="text-base font-bold text-market-ink">
                Good to know
              </Text>
              <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
                {UPDATE_HELP}
              </Text>
            </View>
            {model.latestError ? (
              <View className="gap-2 border-t border-market-line pt-4">
                <Text className="text-base font-bold text-market-ink">
                  Latest update error
                </Text>
                <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
                  {model.latestError}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
