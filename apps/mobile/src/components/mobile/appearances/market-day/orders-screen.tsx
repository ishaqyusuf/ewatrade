import type { OrdersScreenProps } from "@/components/mobile/orders/orders-presentation"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDayOrdersScreen({
  children,
  showCanvasStatusBar,
}: OrdersScreenProps) {
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--orders-list-top": 0,
        "--orders-list-side": 0,
        "--orders-list-bottom": Math.max(insets.bottom + 116, 152),
        "--orders-safe-top": insets.top,
      }}
    >
      <View className="flex-1 bg-market-canvas" testID="admin-orders-screen">
        <StatusBar
          animated
          backgroundColor={
            showCanvasStatusBar ? palette.canvas : palette.marigold
          }
          style={
            showCanvasStatusBar && colorScheme === "dark" ? "light" : "dark"
          }
        />
        <View
          pointerEvents="none"
          className={cn(
            "absolute inset-x-0 top-0 z-[100] h-[var(--orders-safe-top)]",
            showCanvasStatusBar ? "bg-market-canvas" : "bg-market-marigold",
          )}
          testID="orders-status-bar-background"
        />
        {children}
      </View>
    </VariableContextProvider>
  )
}
