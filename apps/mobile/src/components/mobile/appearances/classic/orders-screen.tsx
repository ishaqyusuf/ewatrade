import {
  CommerceFilterChip,
  CommerceMetricTile,
  CommerceOrderRow,
  CommercePageHeader,
  commerceOrderItemCount,
  type CommercialOrder,
} from "@/components/mobile/commerce"
import type {
  OrdersFilterProps,
  OrdersMastheadProps,
  OrdersRowProps,
  OrdersScreenProps,
  OrdersSummaryProps,
} from "@/components/mobile/orders/orders-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { formatMinorMoney } from "@ewatrade/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ClassicOrdersScreen({ children }: OrdersScreenProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--orders-list-top": insets.top + 20,
        "--orders-list-side": 8,
        "--orders-list-bottom": Math.max(insets.bottom + 116, 152),
        "--orders-safe-top": insets.top,
      }}
    >
      <View className="flex-1 bg-background" testID="admin-orders-screen">
        <StatusBar animated style={colorScheme === "dark" ? "light" : "dark"} />
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 z-[100] h-[var(--orders-safe-top)] bg-background"
        />
        {children}
      </View>
    </VariableContextProvider>
  )
}

export function ClassicOrdersMasthead({
  onCustomersPress,
  onLayout,
}: OrdersMastheadProps) {
  return (
    <View className="px-4" onLayout={onLayout}>
      <CommercePageHeader
        title="Orders"
        subtitle="Review payment and fulfilment across every order."
        action={
          <Pressable
            accessibilityLabel="Open customers"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
            haptic
            onPress={onCustomersPress}
          >
            <Icon className="size-base text-foreground" name="Users" />
          </Pressable>
        }
      />
    </View>
  )
}

function currencyMetric(orders: CommercialOrder[], average = false) {
  if (orders.length === 0) return "—"
  if (new Set(orders.map((order) => order.currencyCode)).size !== 1)
    return "Mixed currencies"
  const total = orders.reduce((sum, order) => sum + order.totalMinor, 0)
  return formatMinorMoney(
    average ? Math.round(total / orders.length) : total,
    orders[0]?.currencyCode ?? "NGN",
  )
}

export function ClassicOrdersSummary({ orders }: OrdersSummaryProps) {
  const largeText = useLargeTextLayout()
  const itemCount = orders.reduce(
    (sum, order) => sum + commerceOrderItemCount(order),
    0,
  )
  return (
    <View className="gap-3 px-4">
      <View className={largeText ? "gap-3" : "flex-row gap-3"}>
        <CommerceMetricTile
          icon="ReceiptText"
          label="Loaded orders"
          value={String(orders.length)}
        />
        <CommerceMetricTile
          icon="ListChecks"
          label="Loaded items"
          value={itemCount.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        />
      </View>
      <View className={largeText ? "gap-3" : "flex-row gap-3"}>
        <CommerceMetricTile
          icon="Calculator"
          label="Average value"
          value={currencyMetric(orders, true)}
        />
        <CommerceMetricTile
          icon="Wallet"
          label="Loaded value"
          value={currencyMetric(orders)}
        />
      </View>
    </View>
  )
}

export function ClassicOrdersFilterRow<T extends string>({
  active,
  labels,
  onChange,
  values,
}: OrdersFilterProps<T>) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {values.map((value) => (
        <CommerceFilterChip
          key={value}
          active={active === value}
          label={labels?.[value] ?? value}
          onPress={() => onChange(value)}
        />
      ))}
    </View>
  )
}

export function ClassicOrdersRow({ order, onPress }: OrdersRowProps) {
  return <CommerceOrderRow order={order} onPress={onPress} />
}

export function ClassicOrdersSection({ children }: { children: ReactNode }) {
  return <View className="gap-[14px] px-4">{children}</View>
}
