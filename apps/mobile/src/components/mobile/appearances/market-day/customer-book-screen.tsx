import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { customerValueLabel } from "../../commerce/commerce-model"
import type {
  CustomerBookHeaderProps,
  CustomerBookRowProps,
  CustomerBookFilterProps,
} from "../../customer-book/customer-book-view"

export function MarketDayCustomerBookHeader({
  loadedCount,
  pendingCount,
}: CustomerBookHeaderProps) {
  return (
    <View className="gap-3 rounded-b-3xl border-b-4 border-market-marigold bg-market-paprika px-5 py-6">
      <Text className="font-market-mono text-xs uppercase tracking-widest text-market-on-paprika">
        Your people, remembered
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-4xl text-market-on-paprika"
      >
        Good business.{"\n"}Familiar faces.
      </Text>
      <Text className="text-sm leading-6 text-market-on-paprika">
        Save a contact once. Bring their order story with you.
      </Text>
      <View className="gap-1 border-t border-market-on-marigold-hairline pt-3">
        <Text className="font-market-mono text-xs text-market-on-paprika">
          {loadedCount} loaded contacts · Not a complete directory count
        </Text>
        {pendingCount > 0 ? (
          <Text className="text-xs text-market-on-paprika">
            {pendingCount} contacts have device-only orders pending sync
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function MarketDayCustomerBookRow({
  customer,
  historyComplete,
  onPress,
}: CustomerBookRowProps) {
  const synced = customer.orders.length
  const pending = customer.pendingOrders.length
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${customer.name}`}
      onPress={onPress}
      haptic
      className="mx-2 mb-3 flex-row items-start gap-3 rounded-2xl border border-market-line bg-market-field p-4 active:bg-market-soft-band"
    >
      <View className="size-12 items-center justify-center rounded-xl bg-market-palm">
        <Text className="text-base font-extrabold text-market-on-palm">
          {customer.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text className="text-lg font-extrabold text-market-ink">
          {customer.name}
        </Text>
        <Text className="text-sm text-market-muted-ink">
          {customer.phone ?? customer.email ?? "No contact details"}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-full bg-market-soft-band px-3 py-1">
            <Text className="text-xs font-bold text-market-ink">
              {synced
                ? "Synced orders"
                : pending
                  ? "Pending sync"
                  : "Saved contact"}
            </Text>
          </View>
        </View>
        <Text className="text-xs leading-5 text-market-muted-ink">
          {synced
            ? `${historyComplete ? "" : "Loaded · "}${synced} synced ${synced === 1 ? "order" : "orders"} · ${customerValueLabel(customer)}`
            : historyComplete
              ? "No synced orders"
              : "No synced orders loaded"}
        </Text>
        {pending > 0 ? (
          <Text className="text-xs leading-5 text-market-accent-ink">
            {pending} device-only {pending === 1 ? "order" : "orders"} · Value
            not synced
          </Text>
        ) : null}
      </View>
      <Icon
        name="ChevronRight"
        className="mt-1 size-sm text-market-muted-ink"
      />
    </Pressable>
  )
}

export function MarketDayCustomerBookFilter({
  active,
  label,
  onPress,
}: CustomerBookFilterProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      haptic
      className={
        active
          ? "min-h-11 justify-center rounded-full bg-market-palm px-4 py-2"
          : "min-h-11 justify-center rounded-full border border-market-line bg-market-field px-4 py-2"
      }
    >
      <Text
        className={
          active
            ? "text-sm font-bold text-market-on-palm"
            : "text-sm font-bold text-market-ink"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}
