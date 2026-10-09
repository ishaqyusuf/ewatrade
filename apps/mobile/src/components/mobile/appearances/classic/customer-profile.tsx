import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  customerOrderCount,
  customerValueLabel,
} from "../../commerce/commerce-model"
import {
  CommerceInfoRow,
  CommerceMetricTile,
  CommerceSection,
} from "../../commerce/commerce-primitives"
import type { CustomerProfileProps } from "../../customer-book/customer-book-view"
import { customerSyncLabel } from "../../customer-book/customer-sync-label"
import { HeroCard } from "../../green-till/hero-card"

export function ClassicCustomerProfile({
  customer,
  historyComplete,
}: CustomerProfileProps) {
  return (
    <HeroCard
      label={customer.name}
      amount={customer.orders.length ? customerValueLabel(customer) : "—"}
      sub={
        customer.orders.length
          ? `${historyComplete ? "Order value" : "Loaded order value"} · ${customer.phone ?? customer.email ?? "No contact details"}`
          : "No synced orders yet"
      }
      pill={{
        label: customerSyncLabel(
          customer.orders.length,
          customer.pendingOrders.length,
        ),
        tone: customer.pendingOrders.length ? "offline" : "synced",
      }}
      stats={[
        {
          label: historyComplete ? "Orders" : "Loaded orders",
          value: String(customerOrderCount(customer)),
        },
        {
          label: "Waiting to sync",
          value: String(customer.pendingOrders.length),
        },
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
