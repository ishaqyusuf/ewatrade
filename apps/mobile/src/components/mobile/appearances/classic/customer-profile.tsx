import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { formatMinorMoney } from "@ewatrade/utils"
import { Fragment } from "react"
import { Text as NativeText, View as NativeView } from "react-native"
import {
  type CommercialOrder,
  type PendingCommerceOrder,
  customerOrderCount,
  customerValueLabel,
} from "../../commerce/commerce-model"
import { CommerceMetricTile } from "../../commerce/commerce-primitives"
import type { CustomerProfileProps } from "../../customer-book/customer-book-view"
import { HeroCard } from "../../green-till/hero-card"
import { RecordRow, StatusPill } from "../../green-till/kit"
import {
  ledgerItemsLabel,
  ledgerPayment,
} from "../../orders/orders-ledger-model"
import { customerLastSeen } from "./customer-book-screen"

const whole = (value: string) => value.replace(/\.00$/, "")

/** "Mar 2026", or "Today" for a customer saved today. */
function customerSince(value: Date | string | undefined, now = new Date()) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  if (date.toDateString() === now.toDateString()) return "Today"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date)
}

function lastOrderDate(customer: CustomerProfileProps["customer"]) {
  const times = [
    ...customer.orders.map((order) => new Date(order.createdAt).getTime()),
    ...customer.pendingOrders.map((order) =>
      new Date(order.createdAtClient).getTime(),
    ),
  ].filter(Number.isFinite)
  return times.length ? new Date(Math.max(...times)) : null
}

export function ClassicCustomerProfile({
  customer,
  historyComplete,
}: CustomerProfileProps) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const count = customerOrderCount(customer)
  const queued = customer.pendingOrders.length
  const last = lastOrderDate(customer)
  const since = customerSince(customer.createdAt)
  const top = (
    <NativeView style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
      <NativeView
        style={{
          alignItems: "center",
          backgroundColor: palette.heroLine,
          borderRadius: 28,
          height: 56,
          justifyContent: "center",
          width: 56,
        }}
      >
        <NativeText
          maxFontSizeMultiplier={1.3}
          style={{
            color: palette.heroForeground,
            fontSize: 18,
            fontWeight: "800",
          }}
        >
          {customer.initials}
        </NativeText>
      </NativeView>
      <NativeView style={{ flex: 1, minWidth: 0 }}>
        <NativeText
          accessibilityRole="header"
          numberOfLines={2}
          style={{
            color: palette.heroForeground,
            fontSize: 18,
            fontWeight: "800",
          }}
        >
          {customer.name}
        </NativeText>
        <NativeText
          numberOfLines={1}
          style={{ color: palette.heroMuted, fontSize: 13 }}
        >
          {customer.phone ?? customer.email ?? "No contact details"}
        </NativeText>
      </NativeView>
    </NativeView>
  )
  if (!count)
    return (
      <HeroCard
        top={top}
        title="No orders yet"
        sub={`Saved ${since === "Today" ? "today" : `in ${since}`}. The first sale starts their history.`}
      />
    )
  return (
    <HeroCard
      top={top}
      label={
        customer.orders.length
          ? historyComplete
            ? "Order value"
            : "Loaded order value"
          : "Orders"
      }
      amount={
        customer.orders.length
          ? whole(customerValueLabel(customer))
          : "Waiting to sync"
      }
      pill={{
        label: queued ? `${queued} waiting to sync` : "Synced",
        tone: queued ? "offline" : "synced",
      }}
      stats={[
        {
          label: historyComplete ? "Orders" : "Loaded orders",
          value: String(count),
        },
        {
          label: "Last order",
          value: last ? customerLastSeen(last).replace(/^Today /, "") : "—",
        },
        { label: "Since", value: since },
      ]}
    />
  )
}

export function ClassicCustomerMetrics({
  customer,
  historyComplete,
}: CustomerProfileProps) {
  return (
    <View className="flex-row flex-wrap gap-3">
      <CommerceMetricTile
        icon="Wallet"
        label={historyComplete ? "Order value" : "Loaded value"}
        value={customerValueLabel(customer)}
      />
      <CommerceMetricTile
        icon="ReceiptText"
        label={historyComplete ? "Total orders" : "Loaded orders"}
        value={String(customerOrderCount(customer))}
      />
    </View>
  )
}

function DetailRow({
  icon,
  label,
  tint,
  value,
}: {
  icon: IconKeys
  label: string
  tint: GreenTillTint
  value: string
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View className="min-h-[58px] flex-row items-center gap-3 py-3">
      <NativeView
        style={{
          alignItems: "center",
          backgroundColor: palette[tint],
          borderRadius: 11,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <Icon
          className="size-[16px]"
          color={palette[`${tint}Foreground`]}
          name={icon}
        />
      </NativeView>
      <View className="min-w-0 flex-1">
        <Text className="text-[11.5px] font-bold text-muted-foreground">
          {label}
        </Text>
        <Text className="text-sm font-bold text-foreground">{value}</Text>
      </View>
    </View>
  )
}

export function ClassicCustomerInformation({ customer }: CustomerProfileProps) {
  const rows = [
    {
      icon: "Phone" as const,
      label: "Phone",
      tint: "lilac" as const,
      value: customer.phone ?? "Not provided",
    },
    {
      icon: "Mail" as const,
      label: "Email",
      tint: "sky" as const,
      value: customer.email ?? "Not provided",
    },
    {
      icon: "Calendar" as const,
      label: "Customer since",
      tint: "mint" as const,
      value: customerSince(customer.createdAt),
    },
  ]
  return (
    <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
      {rows.map((row, index) => (
        <Fragment key={row.label}>
          {index ? <View className="h-px bg-border" /> : null}
          <DetailRow {...row} />
        </Fragment>
      ))}
    </View>
  )
}

export function ClassicCustomerOrderRow({
  order,
  onPress,
}: {
  order: CommercialOrder
  onPress: () => void
}) {
  const payment = ["CANCELLED", "REFUNDED"].includes(order.status)
    ? {
        label: order.status === "REFUNDED" ? "Refunded" : "Cancelled",
        tone: "muted" as const,
      }
    : ledgerPayment(order.paymentStatus)
  return (
    <RecordRow
      avatar={{ icon: "ReceiptText", tint: "mint" }}
      title={order.orderNumber}
      meta={`${ledgerItemsLabel(order)} · ${customerLastSeen(new Date(order.createdAt))}`}
      amount={whole(formatMinorMoney(order.totalMinor, order.currencyCode))}
      onPress={onPress}
      status={<StatusPill label={payment.label} tone={payment.tone} />}
    />
  )
}

export function ClassicCustomerPendingRow({
  order,
}: {
  order: PendingCommerceOrder
}) {
  return (
    <RecordRow
      avatar={{ icon: "Clock", tint: "amber" }}
      title="Queued order"
      meta={`${order.lineCount} ${order.lineCount === 1 ? "item" : "items"} · ${customerLastSeen(order.createdAtClient)}`}
      amount={
        order.displayTotal
          ? whole(
              formatMinorMoney(
                order.displayTotal.amountMinor,
                order.displayTotal.currencyCode,
              ),
            )
          : undefined
      }
      status={<StatusPill label="Waiting to sync" tone="muted" />}
    />
  )
}
