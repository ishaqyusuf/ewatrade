import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  businessInitials,
  type MoreFrameProps,
  type MoreHeaderProps,
  type MoreRowProps,
  type MoreWorkspaceProps,
} from "@/components/mobile/more/more-presentation"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDayMoreFrame({
  children,
  onScroll,
  showCanvasStatusBar,
}: MoreFrameProps) {
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--more-safe-top": insets.top,
        "--more-list-bottom": Math.max(insets.bottom + 116, 152),
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
            "absolute inset-x-0 top-0 z-[100] h-[var(--more-safe-top)]",
            showCanvasStatusBar ? "bg-market-canvas" : "bg-market-palm",
          )}
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-[var(--more-list-bottom)]"
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
export function MarketDayMoreHeader({
  onSyncPress,
  syncAlertCount,
  onLayout,
}: MoreHeaderProps) {
  const largeText = useLargeTextLayout()
  return (
    <View
      onLayout={onLayout}
      className="-mx-5 mb-5 gap-4 border-b-[7px] border-market-marigold bg-market-palm px-5 pb-6 pt-[var(--more-safe-top)]"
    >
      <Text className="pt-5 font-market-mono text-[10px] font-bold uppercase tracking-[1.5px] text-market-on-palm-muted">
        Your business · control desk
      </Text>
      <View
        className={cn(
          "gap-4",
          !largeText && "flex-row items-center justify-between",
        )}
      >
        <View className={cn("min-w-0 gap-2", !largeText && "flex-1")}>
          <Text
            accessibilityRole="header"
            className="font-market-display text-[44px] font-black text-market-on-palm [-rn-line-height:50]"
          >
            More
          </Text>
          <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
            Your store. Your settings.
          </Text>
        </View>
        <Pressable
          accessibilityLabel={
            syncAlertCount > 0
              ? `Open sync status, ${syncAlertCount} items need attention`
              : "Open sync status"
          }
          accessibilityRole="button"
          haptic
          onPress={onSyncPress}
          className="min-h-11 flex-row items-center justify-center gap-2 self-start rounded-full bg-market-marigold px-4 py-3 active:opacity-80"
        >
          <Icon name="RefreshCw" className="size-sm text-market-on-marigold" />
          <Text className="text-sm font-bold text-market-on-marigold [-rn-include-font-padding:false] [-rn-line-height:20]">
            {syncAlertCount > 0 ? `Sync ${syncAlertCount}` : "Sync"}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
export function MarketDayMoreWorkspace({
  businessName,
  roleLabel,
  onPress,
}: MoreWorkspaceProps) {
  return (
    <Pressable
      accessibilityLabel={`Switch business from ${businessName}`}
      accessibilityRole="button"
      haptic
      onPress={onPress}
      className="mb-6 min-h-[88px] flex-row items-center gap-3 rounded-[18px] border border-market-line bg-market-field p-4 active:opacity-80"
    >
      <View className="size-12 shrink-0 items-center justify-center rounded-xl bg-market-marigold">
        <Text className="text-base font-extrabold text-market-on-marigold">
          {businessInitials(businessName)}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-lg font-extrabold text-market-ink">
          {businessName}
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {roleLabel} · Current business
        </Text>
      </View>
      <Icon name="ChevronRight" className="size-sm text-market-muted-ink" />
    </Pressable>
  )
}
export function MarketDayMoreSection({
  title,
  children,
}: { title: string; children: ReactNode }) {
  return (
    <View className="mb-6">
      <Text
        accessibilityRole="header"
        className="mb-2 font-market-mono text-[10px] font-bold uppercase tracking-[1.5px] text-market-muted-ink"
      >
        {title}
      </Text>
      <View className="border-t border-market-line">{children}</View>
    </View>
  )
}
export function MarketDayMoreRow({ detail, item, onPress }: MoreRowProps) {
  const danger = item.id === "sign-out"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={detail}
      accessibilityState={{ disabled: item.disabled }}
      disabled={item.disabled}
      haptic={!item.disabled}
      onPress={onPress}
      className="min-h-[68px] flex-row items-center gap-3 border-b border-market-line py-4 active:bg-market-field"
    >
      <View
        className={cn(
          "size-9 shrink-0 items-center justify-center rounded-xl",
          danger ? "bg-market-paprika-wash" : "bg-market-field",
        )}
      >
        <Icon
          name={item.icon}
          className={cn(
            "size-sm",
            danger ? "text-destructive" : "text-market-accent-ink",
          )}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={cn(
            "text-base font-bold",
            danger ? "text-destructive" : "text-market-ink",
          )}
        >
          {item.label}
        </Text>
        {detail ? (
          <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
            {detail}
          </Text>
        ) : null}
      </View>
      {item.disabled ? (
        <Text className="text-xs font-bold text-market-muted-ink">Set up</Text>
      ) : (
        <Icon name="ChevronRight" className="size-sm text-market-muted-ink" />
      )}
    </Pressable>
  )
}
