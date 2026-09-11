import type { OrderDetailScreenProps } from "@/components/mobile/order-detail/order-detail-presentation"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { StatusBar } from "expo-status-bar"

export function MarketDayOrderDetailScreen({
  children,
  hasBalanceDue,
  mastheadVisible,
  onScroll,
}: OrderDetailScreenProps) {
  const { colorScheme } = useColorScheme()
  const palette = useMarketDayPalette()
  const safeAreaColor = mastheadVisible ? palette.marigold : palette.canvas
  return (
    <View className="flex-1 bg-market-canvas">
      <StatusBar
        backgroundColor={safeAreaColor}
        style={mastheadVisible || colorScheme === "light" ? "dark" : "light"}
      />
      <MobileScreen
        backgroundColor={palette.canvas}
        contentClassName={hasBalanceDue ? "pb-32" : "pb-12"}
        keyboardBottomOffset={24}
        onScroll={onScroll}
        refreshControl={<QueryRefreshControl />}
        safeAreaColor={safeAreaColor}
        scroll
      >
        {children}
      </MobileScreen>
    </View>
  )
}
