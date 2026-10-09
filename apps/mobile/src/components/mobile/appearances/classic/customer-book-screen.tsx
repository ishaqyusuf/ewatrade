import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { catalogAvatarTint } from "../../catalog/catalog-shelf-model"
import {
  customerOrderCount,
  customerValueLabel,
} from "../../commerce/commerce-model"
import type {
  CustomerBookFilterProps,
  CustomerBookHeaderProps,
  CustomerBookRowProps,
} from "../../customer-book/customer-book-view"
import { HeroCard } from "../../green-till/hero-card"
import { RecordRow, StatusPill } from "../../green-till/kit"

/** "Today 10:42", "Yesterday", "Mon" within a week, else "6 Oct". */
export function customerLastSeen(date: Date, now = new Date()) {
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((day(now) - day(date)) / 86_400_000)
  if (days === 0)
    return `Today ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)}`
  if (days === 1) return "Yesterday"
  if (days > 1 && days < 7)
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date)
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

export function ClassicCustomerBookHeader({
  loadedCount,
  pendingCount,
  noOrdersCount = 0,
  hasMore,
  isLoading,
  hasError,
  isOffline,
}: CustomerBookHeaderProps) {
  const summary = [
    pendingCount
      ? `${pendingCount} with orders waiting to sync`
      : "Every order synced",
    noOrdersCount ? `${noOrdersCount} not ordered yet` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <HeroCard
      label="Customer book"
      amount={
        isLoading
          ? undefined
          : hasError && !loadedCount
            ? "—"
            : `${loadedCount}${hasMore ? "+" : ""} ${loadedCount === 1 ? "customer" : "customers"}`
      }
      sub={
        isLoading
          ? undefined
          : isOffline
            ? `Saved copy on this device · ${summary}`
            : hasError
              ? "Some customers could not be loaded"
              : summary
      }
      pill={{
        label: isOffline ? "Saved copy" : "Synced",
        tone: isOffline ? "offline" : "synced",
      }}
    >
      {isLoading ? (
        <View className="py-3">
          <Skeleton className="h-10 w-40" />
        </View>
      ) : null}
    </HeroCard>
  )
}

/** Latest saved or queued order time, for "12 orders · last Today, 10:42". */
function lastOrderAt(customer: CustomerBookRowProps["customer"]) {
  const times = [
    ...customer.orders.map((order) => new Date(order.createdAt).getTime()),
    ...customer.pendingOrders.map((order) =>
      new Date(order.createdAtClient).getTime(),
    ),
  ].filter(Number.isFinite)
  return times.length ? new Date(Math.max(...times)) : null
}

export function ClassicCustomerBookRow({
  customer,
  historyComplete,
  onPress,
  position = { first: true, last: true },
}: CustomerBookRowProps) {
  const count = customerOrderCount(customer)
  const queued = customer.pendingOrders.length
  const last = lastOrderAt(customer)
  const activity = !count
    ? "No orders yet"
    : !customer.orders.length
      ? queued === 1
        ? "Order waiting to sync"
        : "Orders waiting to sync"
      : `${plural(count, historyComplete ? "order" : "loaded order", historyComplete ? "orders" : "loaded orders")}${last ? ` · last ${customerLastSeen(last)}` : ""}`
  return (
    <View
      className={cn(
        "bg-card px-3.5",
        position.first && "rounded-t-[20px]",
        position.last && "mb-1 rounded-b-[20px]",
      )}
    >
      <View className={position.last ? undefined : "border-b border-border"}>
        <RecordRow
          stackDetails
          avatar={{
            initials: customer.initials,
            tint: catalogAvatarTint(customer.name, "product"),
          }}
          title={customer.name}
          meta={[
            customer.phone ?? customer.email ?? "No contact details",
            activity,
          ]}
          amount={
            customer.orders.length
              ? customerValueLabel(customer).replace(/\.00$/, "")
              : "—"
          }
          onPress={onPress}
          status={
            queued ? (
              <StatusPill label={`${queued} waiting`} tone="muted" />
            ) : !count ? (
              <StatusPill label="New" tone="ok" />
            ) : undefined
          }
        />
      </View>
    </View>
  )
}

export function ClassicCustomerBookFilter({
  active,
  count,
  label,
  onPress,
}: CustomerBookFilterProps) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        "min-h-9 flex-row items-center gap-1.5 rounded-full px-[13px] py-1.5",
        active ? "bg-foreground" : "bg-card shadow-sm",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-[13px] font-bold",
          active ? "text-background" : "text-foreground",
        )}
      >
        {label}
      </Text>
      {count !== undefined && !largeText ? (
        <Text
          className={cn(
            "text-[11.5px] font-extrabold tabular-nums",
            active ? "text-background opacity-70" : "text-muted-foreground",
          )}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  )
}
