import type { OrderDetailScreenProps } from "@/components/mobile/order-detail/order-detail-presentation"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"

export function ClassicOrderDetailScreen({
  children,
  hasBalanceDue,
}: OrderDetailScreenProps) {
  const { colorScheme } = useColorScheme()
  return (
    <View className="flex-1 bg-background">
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <MobileScreen
        contentClassName={hasBalanceDue ? "gap-7 pb-32" : "gap-7 pb-12"}
        keyboardBottomOffset={24}
        refreshControl={<QueryRefreshControl />}
        scroll
      >
        {children}
      </MobileScreen>
    </View>
  )
}
