import { Skeleton } from "@/components/ui/skeleton"
import { View } from "@/components/ui/view"
import { CommerceFilterChip } from "../../commerce"
import {
  customerOrderCount,
  customerValueLabel,
} from "../../commerce/commerce-model"
import type {
  CustomerBookFilterProps,
  CustomerBookHeaderProps,
  CustomerBookRowProps,
} from "../../customer-book/customer-book-view"
import { customerSyncLabel } from "../../customer-book/customer-sync-label"
import { FormField } from "../../form-field"
import { HeroCard } from "../../green-till/hero-card"
import { ListCard, RecordRow, StatusPill } from "../../green-till/kit"

export function ClassicCustomerBookHeader({
  loadedCount,
  pendingCount,
  isLoading,
  hasError,
  isOffline,
  search,
  onSearch,
}: CustomerBookHeaderProps) {
  return (
    <HeroCard
      label="Your customer book"
      amount={
        isLoading
          ? undefined
          : hasError && !loadedCount
            ? "—"
            : String(loadedCount)
      }
      sub={
        isOffline
          ? "Saved customers on this device"
          : hasError
            ? "Some customers could not be loaded"
            : "Customers in this loaded view"
      }
      pill={{
        label: isOffline
          ? "Saved copy"
          : pendingCount
            ? `${pendingCount} waiting`
            : "Online",
        tone: isOffline || pendingCount ? "offline" : "synced",
      }}
    >
      {isLoading ? (
        <View className="py-3">
          <Skeleton className="h-10 w-24" />
        </View>
      ) : null}
      {onSearch ? (
        <View className="mt-4">
          <FormField
            accessibilityLabel="Search customers"
            label="Find a customer"
            placeholder={
              isOffline ? "Search saved copy" : "Search name, phone or email"
            }
            value={search ?? ""}
            onChangeText={onSearch}
          />
        </View>
      ) : null}
    </HeroCard>
  )
}
export function ClassicCustomerBookRow({
  customer,
  historyComplete,
  onPress,
}: CustomerBookRowProps) {
  const count = customerOrderCount(customer)
  return (
    <ListCard>
      <RecordRow
        stackDetails
        avatar={{
          initials: customer.initials,
          tint: customer.pendingOrders.length ? "amber" : "lilac",
        }}
        title={customer.name}
        meta={`${customer.phone ?? customer.email ?? "No contact details"} · ${count} ${historyComplete ? "orders" : "loaded orders"}`}
        amount={
          customer.orders.length ? customerValueLabel(customer) : undefined
        }
        onPress={onPress}
        status={
          <StatusPill
            label={customerSyncLabel(
              customer.orders.length,
              customer.pendingOrders.length,
            )}
            tone={
              customer.pendingOrders.length
                ? "warn"
                : customer.orders.length
                  ? "ok"
                  : "muted"
            }
          />
        }
      />
    </ListCard>
  )
}
export function ClassicCustomerBookFilter(props: CustomerBookFilterProps) {
  return <CommerceFilterChip {...props} />
}
