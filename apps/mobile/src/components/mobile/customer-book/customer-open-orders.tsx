import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"

export function CustomerOpenOrders({
  customerId,
  phone,
  onOpenOrder,
}: {
  customerId?: string
  phone?: string | null
  onOpenOrder: (orderId: string) => void
}) {
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const query = useQuery(
    trpc.orders.lookupOpen.queryOptions(
      customerId ? { customerId } : { phone: phone ?? "" },
      {
        enabled: !isOffline && Boolean(customerId || phone),
        retry: false,
      },
    ),
  )
  if (isOffline || (!customerId && !phone)) return null
  return (
    <View className="gap-2 px-4 py-3">
      <Text className="text-base font-semibold text-foreground">
        Open orders to collect or fulfil
      </Text>
      {query.isPending ? (
        <Text className="text-sm text-muted-foreground">
          Looking up open orders…
        </Text>
      ) : null}
      {query.isError ? (
        <Pressable
          onPress={() => void query.refetch()}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm text-destructive">
            Could not look up open orders. Tap to retry.
          </Text>
        </Pressable>
      ) : null}
      {query.data?.map((order) => (
        <Pressable
          key={order.id}
          accessibilityRole="button"
          onPress={() => onOpenOrder(order.id)}
          className="min-h-16 gap-1 border-b border-border py-3"
        >
          <Text className="font-medium text-foreground">
            {order.orderNumber} ·{" "}
            {formatMinorMoney(order.totalMinor, order.currencyCode)}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Taken by {order.createdBy?.name || "a sales rep"}
          </Text>
        </Pressable>
      ))}
      {query.data?.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No open orders for this customer.
        </Text>
      ) : null}
    </View>
  )
}
