import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import {
  searchResultIcon,
  type SearchAction,
  type SearchFrameProps,
  type SearchHeaderProps,
  type SearchRowProps,
} from "@/components/mobile/global-search/search-presentation"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDaySearchFrame({
  children,
  footerHeight,
  onScroll,
  showCanvasStatusBar,
}: SearchFrameProps) {
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--search-safe-top": insets.top,
        "--search-content-bottom": footerHeight + 24,
      }}
    >
      <View className="flex-1 bg-market-canvas">
        <StatusBar
          animated
          backgroundColor={showCanvasStatusBar ? palette.canvas : palette.palm}
          style={
            !showCanvasStatusBar || colorScheme === "dark" ? "light" : "dark"
          }
        />
        <View
          pointerEvents="none"
          className={cn(
            "absolute inset-x-0 top-0 z-[100] h-[var(--search-safe-top)]",
            showCanvasStatusBar ? "bg-market-canvas" : "bg-market-palm",
          )}
        />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pb-[var(--search-content-bottom)]"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
export function MarketDaySearchHeader({
  onClose,
  onLayout,
}: SearchHeaderProps) {
  return (
    <View
      onLayout={onLayout}
      className="-mx-5 gap-4 border-b-[7px] border-market-marigold bg-market-palm px-5 pb-6 pt-[var(--search-safe-top)]"
    >
      <View className="flex-row items-center gap-3 pt-3">
        <Pressable
          accessibilityLabel="Close global search"
          accessibilityRole="button"
          haptic
          onPress={onClose}
          className="size-11 shrink-0 items-center justify-center rounded-full border border-market-hero-hairline active:bg-market-hero-pressed"
        >
          <Icon name="ArrowLeft" className="size-base text-market-on-palm" />
        </Pressable>
        <Text className="min-w-0 flex-1 font-market-mono text-[10px] font-bold uppercase tracking-[1.4px] text-market-on-palm-muted">
          Workspace search
        </Text>
      </View>
      <Text
        accessibilityRole="header"
        className="font-market-display text-[38px] font-black text-market-on-palm [-rn-line-height:44]"
      >
        Find it fast.
      </Text>
      <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
        Orders, people, products and service work.
      </Text>
    </View>
  )
}
export function MarketDaySearchSection({
  title,
  children,
}: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="font-market-mono text-[11px] font-bold uppercase tracking-[1.2px] text-market-muted-ink"
      >
        {title}
      </Text>
      <View className="border-t border-market-line">{children}</View>
    </View>
  )
}
export function MarketDaySearchRow({ item, onPress }: SearchRowProps) {
  return (
    <Pressable
      accessibilityLabel={`Open ${item.title}`}
      accessibilityRole="button"
      haptic
      onPress={onPress}
      className="min-h-[76px] flex-row items-center gap-3 border-b border-market-line py-4 active:bg-market-field"
    >
      <View
        className={cn(
          "size-11 shrink-0 items-center justify-center rounded-xl",
          item.type === "order" ? "bg-market-palm" : "bg-market-field",
        )}
      >
        <Icon
          name={searchResultIcon(item.type)}
          className={cn(
            "size-sm",
            item.type === "order"
              ? "text-market-on-palm"
              : "text-market-accent-ink",
          )}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-bold text-market-ink">
          {item.title}
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {item.subtitle}
        </Text>
      </View>
      <Icon name="ChevronRight" className="size-sm text-market-muted-ink" />
    </Pressable>
  )
}
export function MarketDaySearchActionRow({ action }: { action: SearchAction }) {
  return (
    <Pressable
      accessibilityLabel={action.label}
      accessibilityHint={action.detail}
      accessibilityRole="button"
      haptic
      onPress={action.onPress}
      className="min-h-[72px] flex-row items-center gap-3 border-b border-market-line py-4 active:bg-market-field"
    >
      <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-market-marigold">
        <Icon name={action.icon} className="size-sm text-market-on-marigold" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-bold text-market-ink">
          {action.label}
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {action.detail}
        </Text>
      </View>
      <Icon name="ArrowRight" className="size-sm text-market-muted-ink" />
    </Pressable>
  )
}
