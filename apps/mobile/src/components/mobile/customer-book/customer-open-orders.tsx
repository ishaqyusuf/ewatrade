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
  // Only speak up when there is something to act on: no loading or empty copy.
  if (
    isOffline ||
    (!customerId && !phone) ||
    query.isPending ||
    (!query.isError && !query.data?.length)
  )
    return null
  return (
    <View className="gap-1 rounded-[20px] bg-card px-3.5 py-3 shadow-sm">
      <Text className="text-sm font-extrabold text-foreground">
        Open orders to collect or fulfil
      </Text>
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
          className="min-h-14 gap-0.5 border-t border-border py-2.5"
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
    </View>
  )
}
