import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { Pressable } from "@/components/ui/pressable"
import { Icon } from "@/components/ui/icon"
import {
  commerceStatusLabel,
  formatCommerceDate,
  type CommercialOrder,
  type PendingCommerceOrder,
} from "../../commerce/commerce-model"
import { formatMinorMoney } from "@ewatrade/utils"
import type { CustomerProfileProps } from "../../customer-book/customer-book-view"

export function MarketDayCustomerNavigation({
  onBack,
  onClose,
}: { onBack: () => void; onClose?: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-3 pt-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back from customer overview"
        onPress={onBack}
        haptic
        className="min-h-11 min-w-0 flex-1 flex-row items-center gap-2 py-2"
      >
        <Icon name="ChevronLeft" className="size-sm text-market-accent-ink" />
        <Text className="min-w-0 flex-1 text-sm font-bold text-market-accent-ink">
          Customer overview
        </Text>
      </Pressable>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close customer overview"
          onPress={onClose}
          haptic
          className="size-11 items-center justify-center rounded-full border border-market-line bg-market-field"
        >
          <Icon name="X" className="size-sm text-market-ink" />
        </Pressable>
      ) : null}
    </View>
  )
}

export function MarketDayCustomerProfile({ customer }: CustomerProfileProps) {
  return (
    <View className="gap-4 rounded-3xl border-b-4 border-market-marigold bg-market-field p-5">
      <Text className="font-market-mono text-xs uppercase tracking-widest text-market-accent-ink">
        In your neighbour book
      </Text>
      <View className="flex-row items-start gap-4">
        <View className="size-16 items-center justify-center rounded-2xl bg-market-palm">
          <Text className="text-xl font-extrabold text-market-on-palm">
            {customer.initials}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-2">
          <Text
            accessibilityRole="header"
            className="font-market-display text-3xl text-market-ink"
          >
            {customer.name}
          </Text>
          <Text className="text-sm leading-5 text-market-muted-ink">
            {customer.phone ?? customer.email ?? "No contact details"}
          </Text>
          <Text className="text-xs font-bold text-market-accent-ink">
            {customer.orders.length
              ? "Synced order activity"
              : customer.pendingOrders.length
                ? "Device-only activity · Pending sync"
                : "Saved contact"}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function MarketDayCustomerMetrics({
  customer,
  historyComplete,
}: CustomerProfileProps) {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[44%] flex-1 gap-2 rounded-2xl border-t-4 border-market-marigold bg-market-field p-4">
          <Text className="text-xs text-market-muted-ink">
            {historyComplete ? "Synced order value" : "Loaded synced value"}
          </Text>
          {customer.currencyTotals.length ? (
            customer.currencyTotals.map((total) => (
              <Text
                key={total.currencyCode}
                className="font-market-mono text-lg text-market-ink"
              >
                {formatMinorMoney(total.totalMinor, total.currencyCode)}{" "}
                {total.currencyCode}
              </Text>
            ))
          ) : (
            <Text className="text-sm text-market-ink">
              No synced value loaded
            </Text>
          )}
        </View>
        <View className="min-w-[44%] flex-1 gap-2 rounded-2xl border-t-4 border-market-marigold bg-market-field p-4">
          <Text className="text-xs text-market-muted-ink">
            {historyComplete ? "Synced orders" : "Loaded synced orders"}
          </Text>
          <Text className="font-market-mono text-2xl text-market-ink">
            {customer.orders.length}
          </Text>
          <Text className="text-xs leading-5 text-market-muted-ink">
            {customer.pendingOrders.length} pending sync · not included in value
          </Text>
        </View>
      </View>
    </View>
  )
}

export function MarketDayCustomerInformation({
  customer,
}: CustomerProfileProps) {
  return (
    <View className="gap-3">
      <Text className="border-l-4 border-market-marigold pl-3 text-lg font-extrabold text-market-ink">
        Customer information
      </Text>
      <View className="rounded-2xl border border-market-line bg-market-field px-4">
        {[
          { label: "Phone", value: customer.phone },
          { label: "Email", value: customer.email },
        ].map((fact, index) => (
          <View
            key={fact.label}
            className={
              index === 0
                ? "gap-2 border-b border-market-line py-4"
                : "gap-2 py-4"
            }
          >
            <Text className="font-market-mono text-xs uppercase text-market-muted-ink">
              {fact.label}
            </Text>
            <Text selectable className="text-base text-market-ink">
              {fact.value ?? "Not provided"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function MarketDayCustomerOrderRow({
  order,
  onPress,
}: { order: CommercialOrder; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${order.orderNumber}`}
      onPress={onPress}
      haptic
      className="gap-2 border-b border-market-line py-4 active:bg-market-soft-band"
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-2">
          <Text className="font-market-mono text-sm font-bold text-market-ink">
            {order.orderNumber}
          </Text>
          <Text className="text-xs text-market-muted-ink">
            {formatCommerceDate(order.createdAt)} · {order.lines.length} order
            lines
          </Text>
        </View>
        <Icon name="ChevronRight" className="size-sm text-market-muted-ink" />
      </View>
      <Text className="font-market-mono text-lg text-market-ink">
        {formatMinorMoney(order.totalMinor, order.currencyCode)}{" "}
        {order.currencyCode}
      </Text>
      <Text className="text-xs leading-5 text-market-accent-ink">
        {commerceStatusLabel(order.status)} · Payment:{" "}
        {commerceStatusLabel(order.paymentStatus)}
      </Text>
    </Pressable>
  )
}

export function MarketDayCustomerPendingRow({
  order,
}: { order: PendingCommerceOrder }) {
  return (
    <View className="gap-2 border-b border-market-line py-4">
      <Text className="text-base font-bold text-market-ink">
        Device-only order
      </Text>
      <Text className="text-xs text-market-muted-ink">
        {formatCommerceDate(order.createdAtClient)} · {order.lineCount} order
        lines
      </Text>
      <Text className="text-xs leading-5 text-market-accent-ink">
        Pending sync · Saved value not available
      </Text>
    </View>
  )
}
