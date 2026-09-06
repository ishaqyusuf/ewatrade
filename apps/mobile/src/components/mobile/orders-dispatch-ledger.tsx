import {
  type CommercialOrder,
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
  type OrderDispatchDateFilter,
  buildOrdersDispatchSummary,
  formatOrderDispatchMoney,
  getOrderDispatchPresentation,
  orderDispatchDateLabel,
} from "@/lib/orders-dispatch-ledger"
import type { ReactNode } from "react"
import { StyleSheet, View, type ViewProps } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type OrderDispatchFilter = "all" | "cancelled" | "completed" | "open"

export function OrdersDispatchLedgerMasthead({
  businessName,
  onCustomersPress,
  ...viewProps
}: ViewProps & {
  businessName: string
  onCustomersPress: () => void
}) {
  const insets = useSafeAreaInsets()
  const marketDay = useMarketDayPalette()

  return (
    <View
      {...viewProps}
      style={[
        styles.masthead,
        {
          backgroundColor: marketDay.marigold,
          paddingTop: insets.top + 18,
        },
        viewProps.style,
      ]}
      testID="orders-dispatch-masthead"
    >
      <View style={styles.mastheadCopy}>
        <Text
          numberOfLines={1}
          style={[styles.kicker, { color: marketDay.onMarigold }]}
        >
          {businessName.toUpperCase()} · ORDER DESK
        </Text>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          style={[styles.title, { color: marketDay.onMarigold }]}
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
        style={({ pressed }) => [
          styles.customerButton,
          {
            backgroundColor: pressed
              ? marketDay.onMarigoldPressed
              : "transparent",
            borderColor: marketDay.onMarigold,
          },
        ]}
      >
        <Icon color={marketDay.onMarigold} name="Users" size={22} />
      </Pressable>
    </View>
  )
}

export function OrdersDispatchLedgerSummary({
  dateFilter,
  orders,
}: {
  dateFilter: OrderDispatchDateFilter
  orders: CommercialOrder[]
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()
  const summary = buildOrdersDispatchSummary(orders)
  const facts = [
    { label: "Open", value: String(summary.openCount) },
    { label: "Ready", value: String(summary.readyCount) },
    { label: "Loaded value", value: summary.loadedValue },
  ]

  return (
    <View style={styles.summary} testID="orders-dispatch-summary">
      <View
        style={[
          styles.summaryHeading,
          largeTextLayout ? styles.summaryHeadingLargeText : null,
          { borderBottomColor: marketDay.ink },
        ]}
      >
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          style={[styles.sectionTitle, { color: marketDay.ink }]}
        >
          {orderDispatchDateLabel(dateFilter)}
        </Text>
        <Text style={[styles.updatedLabel, { color: marketDay.mutedInk }]}>
          Loaded now
        </Text>
      </View>
      <View
        style={[
          styles.facts,
          largeTextLayout ? styles.factsLargeText : null,
          { borderBottomColor: marketDay.ink },
        ]}
      >
        {facts.map((fact, index) => (
          <View
            key={fact.label}
            style={[
              styles.fact,
              largeTextLayout ? styles.factLargeText : null,
              index > 0 && !largeTextLayout
                ? { borderLeftColor: marketDay.line, borderLeftWidth: 1 }
                : null,
              index > 0 && largeTextLayout
                ? { borderTopColor: marketDay.line, borderTopWidth: 1 }
                : null,
            ]}
          >
            <Text
              numberOfLines={largeTextLayout ? 2 : 1}
              style={[styles.factValue, { color: marketDay.ink }]}
            >
              {fact.value}
            </Text>
            <Text style={[styles.factLabel, { color: marketDay.mutedInk }]}>
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
}: {
  active: T
  labels?: Partial<Record<T, string>>
  onChange: (value: T) => void
  values: readonly T[]
}) {
  const marketDay = useMarketDayPalette()

  return (
    <View style={styles.filters}>
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
            style={({ pressed }) => [
              styles.filter,
              {
                backgroundColor: selected
                  ? marketDay.palm
                  : pressed
                    ? marketDay.softBand
                    : "transparent",
                borderColor: selected ? marketDay.palm : marketDay.ink,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: selected ? marketDay.onPalm : marketDay.ink },
              ]}
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
}: {
  index: number
  onPress: () => void
  order: CommercialOrder
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()
  const itemCount = commerceOrderItemCount(order)
  const presentation = getOrderDispatchPresentation(order)
  const customer =
    order.customerName || order.customerPhone || "Walk-in customer"
  const actionColors = {
    active: { background: marketDay.palm, foreground: marketDay.onPalm },
    attention: {
      background: marketDay.paprika,
      foreground: marketDay.onPaprika,
    },
    closed: { background: marketDay.line, foreground: marketDay.ink },
    done: { background: marketDay.sky, foreground: marketDay.onMarigold },
    pending: {
      background: marketDay.marigold,
      foreground: marketDay.onMarigold,
    },
    ready: { background: marketDay.palm, foreground: marketDay.onPalm },
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
      style={({ pressed }) => [
        styles.orderRow,
        largeTextLayout ? styles.orderRowLargeText : null,
        {
          backgroundColor: pressed ? marketDay.softBand : "transparent",
          borderBottomColor: marketDay.line,
        },
      ]}
    >
      <Text style={[styles.orderIndex, { color: marketDay.accentInk }]}>
        {String(index + 1).padStart(2, "0")}
      </Text>
      <View style={styles.orderMain}>
        <View
          style={[
            styles.orderTop,
            largeTextLayout ? styles.orderTopLargeText : null,
          ]}
        >
          <Text
            style={[styles.orderIdentity, { color: marketDay.ink }]}
            numberOfLines={largeTextLayout ? 3 : 1}
          >
            {customer} · {order.orderNumber}
          </Text>
          <Text
            style={[styles.orderAmount, { color: marketDay.ink }]}
            numberOfLines={1}
          >
            {formatOrderDispatchMoney(order.totalMinor, order.currencyCode)}
          </Text>
        </View>
        <Text
          style={[styles.orderDetail, { color: marketDay.mutedInk }]}
          numberOfLines={largeTextLayout ? 3 : 2}
        >
          {formatCommerceQuantity(itemCount)}{" "}
          {itemCount === 1 ? "item" : "items"}
          {" · "}
          {presentation.paymentLabel}
          {" · "}
          {formatCommerceDate(order.createdAt)}
        </Text>
        <View
          style={[
            styles.actionTag,
            { backgroundColor: actionColors.background },
          ]}
        >
          <Text
            style={[styles.actionTagText, { color: actionColors.foreground }]}
          >
            {presentation.actionLabel.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

export function OrdersDispatchSection({ children }: { children: ReactNode }) {
  return <View style={styles.section}>{children}</View>
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

const styles = StyleSheet.create({
  actionTag: {
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    marginTop: 9,
    minHeight: 27,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  actionTagText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    lineHeight: 14,
  },
  customerButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  fact: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 13 },
  factLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.65,
    lineHeight: 13,
    marginTop: 7,
    textTransform: "uppercase",
  },
  factLargeText: { paddingHorizontal: 0, paddingVertical: 12 },
  factValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  facts: { borderBottomWidth: 2, flexDirection: "row" },
  factsLargeText: { flexDirection: "column" },
  filter: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.2,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterText: { fontSize: 12, fontWeight: "800", lineHeight: 16 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1.45 },
  masthead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 152,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  mastheadCopy: { flex: 1, gap: 7, minWidth: 0, paddingRight: 16 },
  orderAmount: { fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  orderDetail: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  orderIdentity: { flex: 1, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  orderIndex: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    lineHeight: 20,
    width: 28,
  },
  orderMain: { flex: 1, minWidth: 0 },
  orderRow: {
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 112,
    paddingVertical: 17,
  },
  orderRowLargeText: { alignItems: "flex-start" },
  orderTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  orderTopLargeText: { flexDirection: "column", gap: 4 },
  section: { gap: 14, paddingHorizontal: 20 },
  sectionTitle: {
    flex: 1,
    fontFamily: "serif",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 34,
  },
  summary: { paddingHorizontal: 20, paddingTop: 20 },
  summaryHeading: {
    alignItems: "flex-end",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 8,
  },
  summaryHeadingLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  title: {
    fontFamily: "serif",
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 44,
  },
  updatedLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
    lineHeight: 14,
    textTransform: "uppercase",
  },
})
