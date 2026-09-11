import {
  commerceOrderItemCount,
  formatCommerceDate,
  formatCommerceQuantity,
} from "@/components/mobile/commerce"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import {
  buildOrdersDispatchSummary,
  formatOrderDispatchMoney,
  getOrderDispatchPresentation,
  orderDispatchDateLabel,
} from "@/lib/orders-dispatch-ledger"
import type { ReactNode } from "react"
import { View } from "react-native"
import { VariableContextProvider } from "nativewind"
import { cn } from "@/lib/utils"
import type {
  OrdersMastheadProps,
  OrdersSummaryProps,
  OrdersRowProps,
  OrdersFilterProps,
} from "@/components/mobile/orders/orders-presentation"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type { OrderFilter as OrderDispatchFilter } from "@/components/mobile/orders/orders-presentation"

export function OrdersDispatchLedgerMasthead({
  businessName,
  onCustomersPress,
  onLayout,
}: OrdersMastheadProps) {
  const insets = useSafeAreaInsets()
  const marketDay = useMarketDayPalette()

  return (
    <VariableContextProvider
      value={{ "--orders-masthead-top": insets.top + 18 }}
    >
      <View
        onLayout={onLayout}
        className={cn(
          styles.masthead,
          "bg-market-marigold pt-[var(--orders-masthead-top)]",
        )}
        testID="orders-dispatch-masthead"
      >
        <View className={styles.mastheadCopy}>
          <Text
            numberOfLines={1}
            className={cn(styles.kicker, "text-market-on-marigold")}
          >
            {businessName.toUpperCase()} · ORDER DESK
          </Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            className={cn(styles.title, "text-market-on-marigold")}
          >
            Orders
          </Text>
        </View>
        <Pressable
          accessibilityHint="Opens the customer book"
          accessibilityLabel="Open customers"
          accessibilityRole="button"
          haptic
          onPress={onCustomersPress}
          className={cn(
            styles.customerButton,
            "border-market-on-marigold active:bg-market-on-marigold-pressed",
          )}
        >
          <Icon color={marketDay.onMarigold} name="Users" size={22} />
        </Pressable>
      </View>
    </VariableContextProvider>
  )
}

export function OrdersDispatchLedgerSummary({
  dateFilter,
  orders,
}: OrdersSummaryProps) {
  const largeTextLayout = useLargeTextLayout()
  const summary = buildOrdersDispatchSummary(orders)
  const facts = [
    { label: "Open", value: String(summary.openCount) },
    { label: "Ready", value: String(summary.readyCount) },
    { label: "Loaded value", value: summary.loadedValue },
  ]

  return (
    <View className={styles.summary} testID="orders-dispatch-summary">
      <View
        className={cn(
          styles.summaryHeading,
          largeTextLayout && styles.summaryHeadingLargeText,
          "border-b-market-ink",
        )}
      >
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          className={cn(
            styles.sectionTitle,
            largeTextLayout && "flex-none",
            "text-market-ink",
          )}
        >
          {orderDispatchDateLabel(dateFilter)}
        </Text>
        <Text className={cn(styles.updatedLabel, "text-market-muted-ink")}>
          Loaded now
        </Text>
      </View>
      <View
        className={cn(
          styles.facts,
          largeTextLayout && styles.factsLargeText,
          "border-b-market-ink",
        )}
      >
        {facts.map((fact, index) => (
          <View
            key={fact.label}
            className={cn(
              styles.fact,
              largeTextLayout && styles.factLargeText,
              index > 0 &&
                (largeTextLayout
                  ? "border-t border-market-line"
                  : "border-l border-market-line"),
            )}
          >
            <Text
              numberOfLines={largeTextLayout ? 2 : 1}
              className={cn(styles.factValue, "text-market-ink")}
            >
              {fact.value}
            </Text>
            <Text className={cn(styles.factLabel, "text-market-muted-ink")}>
              {fact.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function OrdersDispatchFilterRow<T extends string>({
  active,
  labels,
  onChange,
  values,
}: OrdersFilterProps<T>) {
  return (
    <View className={styles.filters}>
      {values.map((value) => {
        const selected = value === active
        const label = labels?.[value] ?? humanize(value)
        return (
          <Pressable
            accessibilityLabel={`Show ${label.toLowerCase()} orders`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            haptic
            key={value}
            onPress={() => onChange(value)}
            className={cn(
              styles.filter,
              selected
                ? "border-market-palm bg-market-palm"
                : "border-market-ink active:bg-market-soft-band",
            )}
          >
            <Text
              className={cn(
                styles.filterText,
                selected ? "text-market-on-palm" : "text-market-ink",
              )}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function OrdersDispatchLedgerRow({
  index,
  onPress,
  order,
}: OrdersRowProps) {
  const largeTextLayout = useLargeTextLayout()
  const itemCount = commerceOrderItemCount(order)
  const presentation = getOrderDispatchPresentation(order)
  const customer =
    order.customerName || order.customerPhone || "Walk-in customer"
  const actionColors = {
    active: { background: "bg-market-palm", foreground: "text-market-on-palm" },
    attention: {
      background: "bg-market-paprika",
      foreground: "text-market-on-paprika",
    },
    closed: { background: "bg-market-line", foreground: "text-market-ink" },
    done: {
      background: "bg-market-sky",
      foreground: "text-market-on-marigold",
    },
    pending: {
      background: "bg-market-marigold",
      foreground: "text-market-on-marigold",
    },
    ready: { background: "bg-market-palm", foreground: "text-market-on-palm" },
  }[presentation.tone]
  const itemLabel = `${formatCommerceQuantity(itemCount)} ${
    itemCount === 1 ? "item" : "items"
  }`
  const accessibleSummary = [
    order.orderNumber,
    customer,
    formatOrderDispatchMoney(order.totalMinor, order.currencyCode),
    itemLabel,
    presentation.paymentLabel,
    formatCommerceDate(order.createdAt),
    presentation.actionLabel,
  ].join(", ")

  return (
    <Pressable
      accessibilityHint="Opens the order details"
      accessibilityLabel={accessibleSummary}
      accessibilityRole="button"
      haptic
      onPress={onPress}
      className={cn(
        styles.orderRow,
        largeTextLayout && styles.orderRowLargeText,
        "border-b-market-line active:bg-market-soft-band",
      )}
    >
      <Text className={cn(styles.orderIndex, "text-market-accent-ink")}>
        {String(index + 1).padStart(2, "0")}
      </Text>
      <View className={styles.orderMain}>
        <View
          className={cn(
            styles.orderTop,
            largeTextLayout && styles.orderTopLargeText,
          )}
        >
          <Text
            className={cn(
              styles.orderIdentity,
              largeTextLayout && "flex-none",
              "text-market-ink",
            )}
            numberOfLines={largeTextLayout ? 3 : 1}
          >
            {customer} · {order.orderNumber}
          </Text>
          <Text
            className={cn(styles.orderAmount, "text-market-ink")}
            numberOfLines={1}
          >
            {formatOrderDispatchMoney(order.totalMinor, order.currencyCode)}
          </Text>
        </View>
        <Text
          className={cn(styles.orderDetail, "text-market-muted-ink")}
          numberOfLines={largeTextLayout ? 3 : 2}
        >
          {formatCommerceQuantity(itemCount)}{" "}
          {itemCount === 1 ? "item" : "items"}
          {" · "}
          {presentation.paymentLabel}
          {" · "}
          {formatCommerceDate(order.createdAt)}
        </Text>
        <View className={cn(styles.actionTag, actionColors.background)}>
          <Text className={cn(styles.actionTagText, actionColors.foreground)}>
            {presentation.actionLabel.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

export function OrdersDispatchSection({ children }: { children: ReactNode }) {
  return <View className={styles.section}>{children}</View>
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

const styles = {
  actionTag:
    "mt-[9px] min-h-[27px] items-center self-start justify-center px-[11px] py-[5px]",
  actionTagText: "text-[10px] font-black tracking-[0.8px] [-rn-line-height:14]",
  customerButton:
    "h-12 w-12 items-center justify-center rounded-full border-[1.5px]",
  fact: "min-w-0 flex-1 px-[10px] py-[13px]",
  factLabel:
    "mt-[7px] text-[9px] font-black uppercase tracking-[0.65px] [-rn-line-height:13]",
  factLargeText: "flex-none px-0 py-3",
  factValue: "text-[20px] font-black tracking-[-0.4px]",
  facts: "flex-row border-b-2",
  factsLargeText: "flex-col",
  filter:
    "min-h-11 items-center justify-center rounded-full border-[1.2px] px-4 py-2",
  filterText: "text-[12px] font-extrabold [-rn-line-height:16]",
  filters: "flex-row flex-wrap gap-2",
  kicker: "text-[10px] font-black tracking-[1.45px]",
  masthead: "min-h-[152px] flex-row items-center justify-between px-5 pb-7",
  mastheadCopy: "min-w-0 flex-1 gap-[7px] pr-4",
  orderAmount: "text-[15px] font-black tracking-[-0.2px]",
  orderDetail: "mt-[5px] text-[11px] [-rn-line-height:16]",
  orderIdentity: "flex-1 text-[15px] font-black [-rn-line-height:20]",
  orderIndex:
    "w-7 text-[10px] font-black tracking-[0.4px] [-rn-line-height:20]",
  orderMain: "min-w-0 flex-1",
  orderRow: "min-h-[112px] flex-row gap-[10px] border-b py-[17px]",
  orderRowLargeText: "items-start",
  orderTop: "flex-row items-start justify-between gap-3",
  orderTopLargeText: "flex-col gap-1",
  section: "gap-[14px] px-5",
  sectionTitle:
    "flex-1 font-market-display text-[27px] font-black tracking-[-0.7px] [-rn-line-height:34]",
  summary: "px-5 pt-5",
  summaryHeading: "flex-row items-end gap-3 border-b-2 pb-2",
  summaryHeadingLargeText: "flex-col items-start",
  title:
    "font-market-display text-[38px] font-black tracking-[-1px] [-rn-line-height:44]",
  updatedLabel:
    "text-[9px] font-black uppercase tracking-[0.3px] [-rn-line-height:14]",
} as const
