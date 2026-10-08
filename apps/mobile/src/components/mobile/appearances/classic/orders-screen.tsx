import {
  CommerceFilterChip,
  CommercePageHeader,
  type PendingCommerceOrder,
  commerceOrderItemCount,
} from "@/components/mobile/commerce"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  GhostPreview,
  SetupSteps,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import {
  ledgerFulfillment,
  ledgerMoney,
  ledgerPayment,
} from "@/components/mobile/orders/orders-ledger-model"
import type {
  OrdersFilterProps,
  OrdersMastheadProps,
  OrdersRowProps,
  OrdersScreenProps,
  OrdersSummaryProps,
} from "@/components/mobile/orders/orders-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
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
        "--orders-list-side": 0,
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
  title = "Orders",
  onCustomersPress,
  onSelectReceipts,
  selectingReceipts,
  selectionDisabled,
  onLayout,
}: OrdersMastheadProps) {
  return (
    <View className="px-[18px]" onLayout={onLayout}>
      <CommercePageHeader
        title={title}
        action={
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selectingReceipts
                  ? "Cancel receipt selection"
                  : "Select receipts"
              }
              disabled={selectionDisabled}
              onPress={onSelectReceipts}
              className="min-h-[44px] justify-center px-2"
            >
              <Text className="text-xs font-bold text-primary">
                {selectingReceipts ? "Cancel" : "Select"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Open customers"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
              haptic
              onPress={onCustomersPress}
            >
              <Icon className="size-[20px] text-foreground" name="Users" />
            </Pressable>
          </View>
        }
      />
    </View>
  )
}

export function ClassicOrdersSummary({
  orders,
  totalCount,
  dateFilter,
  onDateChange,
  isOffline,
  savedAt,
  loading,
}: OrdersSummaryProps) {
  if (loading)
    return (
      <View className="gap-3 px-[18px]">
        <Skeleton className="h-[220px] rounded-[26px]" />
      </View>
    )
  return (
    <View className="px-[18px]">
      <HeroCard
        label={`Value of ${orders.length} ${isOffline ? "saved" : "loaded"} orders`}
        amount={ledgerMoney(orders)}
        sub={
          isOffline
            ? `Saved orders${savedAt ? ` · ${savedAt}` : ""}`
            : "Totals cover the orders loaded below"
        }
        pill={{
          label: isOffline ? "Offline" : "Loaded",
          tone: isOffline ? "offline" : "draft",
        }}
        stats={[
          {
            label: isOffline ? "Saved orders" : "Matching orders",
            value: String(totalCount ?? orders.length),
          },
          {
            label: "Unpaid · loaded",
            value: ledgerMoney(orders, "balanceDueMinor"),
          },
        ]}
      >
        <View className="mt-4 flex-row flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["7_days", "7 days"],
              ["30_days", "30 days"],
              ["all", "All time"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: dateFilter === value }}
              className={cn(
                "min-h-[44px] justify-center rounded-[14px] border px-3",
                dateFilter === value
                  ? "border-primary-foreground bg-primary-foreground"
                  : "border-primary-foreground/30",
              )}
              onPress={() => onDateChange?.(value)}
            >
              <Text
                className={cn(
                  "text-xs font-bold",
                  dateFilter === value
                    ? "text-primary"
                    : "text-primary-foreground",
                )}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </HeroCard>
    </View>
  )
}

export function ClassicOrdersSkeleton() {
  return (
    <View className="gap-3">
      {[1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-[88px] rounded-[20px]" />
      ))}
    </View>
  )
}

export function ClassicFirstOrderGate({
  catalogReady,
  onPrimaryPress,
}: { catalogReady: boolean; onPrimaryPress: () => void }) {
  return (
    <View className="gap-4">
      <HeroCard
        label="Before your first order"
        title={
          catalogReady
            ? "Your first order is ready to start."
            : "Orders start with an item."
        }
        sub="Add what you sell, then record your first sale."
        cta={{
          label: catalogReady
            ? "Create first order"
            : "Add a Product or Service",
          onPress: onPrimaryPress,
        }}
      />
      <SetupSteps
        steps={[
          {
            key: "catalog",
            title: "Add what you sell",
            sub: "Name it and set a price.",
            state: catalogReady ? "done" : "now",
            onPress: !catalogReady ? onPrimaryPress : undefined,
          },
          {
            key: "sale",
            title: "Take the first order",
            sub: "Record payment and fulfilment together.",
            state: catalogReady ? "now" : "locked",
            onPress: catalogReady ? onPrimaryPress : undefined,
          },
        ]}
      />
      <GhostPreview
        variant="rows"
        icon="ReceiptText"
        message="Your sales book will appear here."
      />
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

export function ClassicOrdersRow({
  order,
  onPress,
  selecting,
  selected,
  disabled,
}: OrdersRowProps) {
  const largeText = useLargeTextLayout()
  const payment = ledgerPayment(order.paymentStatus)
  return (
    <Pressable
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityLabel={`${selecting ? "Select" : "Open"} ${order.orderNumber}, ${order.customerName || "Walk-in"}`}
      accessibilityState={{
        disabled,
        ...(selecting ? { checked: !!selected } : {}),
      }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[80px] flex-row items-center gap-3 rounded-[20px] bg-card p-3.5 mb-3.5"
    >
      <View className="size-[42px] items-center justify-center rounded-[14px] bg-tint-mint">
        <Icon
          name={selecting && selected ? "CheckCircle2" : "ReceiptText"}
          className="size-[20px] text-tint-mint-foreground"
        />
      </View>
      <View
        className={cn(
          "min-w-0 flex-1 gap-2",
          !largeText && "flex-row items-center",
        )}
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-bold text-foreground">
            {order.customerName || "Walk-in"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {order.orderNumber} · {commerceOrderItemCount(order)} units
          </Text>
          <Text className="text-xs text-tint-sky-foreground">
            {ledgerFulfillment(order.status)}
          </Text>
        </View>
        <View className={cn("gap-1", !largeText && "items-end")}>
          <Text className="text-sm font-bold tabular-nums text-foreground">
            {formatMinorMoney(order.totalMinor, order.currencyCode).replace(
              /\.00$/,
              "",
            )}
          </Text>
          <StatusPill {...payment} />
        </View>
      </View>
    </Pressable>
  )
}

export function ClassicOrdersSection({ children }: { children: ReactNode }) {
  return <View className="gap-[14px] px-[18px]">{children}</View>
}

export function ClassicPendingOrderRow({
  order,
  onPress,
}: { order: PendingCommerceOrder; onPress: () => void }) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open queued order sync status"
      onPress={onPress}
      className="gap-2 rounded-[20px] bg-card p-3.5"
    >
      <View
        className={cn(
          "gap-2",
          !largeText && "flex-row items-center justify-between",
        )}
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-bold text-foreground">
            {order.customerName || "Walk-in"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {order.lineCount} items · Queued order
          </Text>
        </View>
        <StatusPill label="Pending sync" tone="warn" />
      </View>
      <Text className="text-sm font-bold text-foreground">
        {order.displayTotal
          ? formatMinorMoney(
              order.displayTotal.amountMinor,
              order.displayTotal.currencyCode,
            ).replace(/\.00$/, "")
          : "Amount available after sync"}
      </Text>
    </Pressable>
  )
}
