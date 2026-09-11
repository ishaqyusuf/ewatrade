import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { StatusBadge } from "../../status-badge"
import {
  CommerceInfoRow,
  CommerceMetricTile,
  CommerceSection,
} from "../../commerce/commerce-primitives"
import {
  customerOrderCount,
  customerValueLabel,
} from "../../commerce/commerce-model"
import type { CustomerProfileProps } from "../../customer-book/customer-book-view"

export function ClassicCustomerProfile({ customer }: CustomerProfileProps) {
  const count = customerOrderCount(customer)
  const pendingOnly =
    !customer.orders.length && customer.pendingOrders.length > 0
  return (
    <View className="flex-row items-center gap-4">
      <View className="size-16 items-center justify-center rounded-full bg-primary">
        <Text className="text-lg font-extrabold text-primary-foreground">
          {customer.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-2xl font-extrabold text-foreground">
            {customer.name}
          </Text>
          <StatusBadge
            label={!count ? "Saved" : pendingOnly ? "Pending sync" : "Synced"}
            tone={!count ? "primary" : pendingOnly ? "warning" : "success"}
          />
        </View>
        <Text className="text-sm text-muted-foreground">
          {customer.phone ?? customer.email ?? "No contact details"}
        </Text>
      </View>
    </View>
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

export function ClassicCustomerInformation({ customer }: CustomerProfileProps) {
  return (
    <CommerceSection title="Customer information">
      <CommerceInfoRow
        detail={customer.phone ?? "Not provided"}
        icon="Phone"
        title="Phone"
      />
      <CommerceInfoRow
        detail={customer.email ?? "Not provided"}
        icon="Mail"
        title="Email"
      />
    </CommerceSection>
  )
}
