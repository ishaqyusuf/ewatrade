import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { ListCard, RecordRow } from "../green-till/kit"

type BucketKey =
  RouterOutputs["customerLedger"]["aging"]["buckets"][number]["key"]

export const owedBucketLabels: Record<BucketKey, string> = {
  DAYS_0_30: "0–30 days",
  DAYS_31_60: "31–60 days",
  DAYS_61_90: "61–90 days",
  DAYS_OVER_90: "Over 90 days",
}
// Older debt is drawn stronger.
const bucketOpacity: Record<BucketKey, number> = {
  DAYS_0_30: 0.35,
  DAYS_31_60: 0.55,
  DAYS_61_90: 0.75,
  DAYS_OVER_90: 1,
}

/**
 * Workshop Mobile Quality v19, screen 18 v2 direction 01: what the customer
 * owes in all, by age, including unpaid linked Orders not on the statement.
 * Paid-ahead money is never netted into the buckets.
 */
export function OwedForCard({
  accountId,
  offline,
}: {
  accountId: string
  offline: boolean
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const [showOrders, setShowOrders] = useState(false)
  const query = useQuery(
    trpc.customerLedger.aging.queryOptions(
      { accountId },
      { retry: false, enabled: !offline },
    ),
  )
  const aging = query.data
  if (!aging || BigInt(aging.totalOwedMinor) === BigInt(0)) return null
  const total = BigInt(aging.totalOwedMinor)
  const whole = (value: string) =>
    formatFinanceMoney(value, aging.currencyCode).replace(/\.00$/, "")
  const since = aging.oldestOwedAt
    ? new Date(aging.oldestOwedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : null
  const orders = aging.unpaidOrders
  return (
    <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="min-w-0 flex-1 text-base font-extrabold text-foreground">
          Owes you {whole(aging.totalOwedMinor)} in all
        </Text>
        {since ? (
          <Text className="text-sm font-bold text-muted-foreground">
            since {since}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          backgroundColor: palette.amber,
          borderRadius: 99,
          flexDirection: "row",
          height: 8,
          overflow: "hidden",
        }}
      >
        {aging.buckets.map((bucket) =>
          BigInt(bucket.totalMinor) > BigInt(0) ? (
            <View
              key={bucket.key}
              style={{
                backgroundColor: palette.amberForeground,
                flex: Number(
                  (BigInt(bucket.totalMinor) * BigInt(1000)) / total,
                ),
                opacity: bucketOpacity[bucket.key],
              }}
            />
          ) : null,
        )}
      </View>
      <View className="flex-row flex-wrap gap-y-1.5">
        {aging.buckets.map((bucket) => {
          const owed = BigInt(bucket.totalMinor) > BigInt(0)
          return (
            <View
              key={bucket.key}
              accessibilityLabel={`${owedBucketLabels[bucket.key]}: ${whole(bucket.totalMinor)}`}
              className="w-1/2 flex-row justify-between gap-2 pr-3"
            >
              <Text className="text-sm font-semibold text-muted-foreground">
                {owedBucketLabels[bucket.key]}
              </Text>
              <Text
                className={
                  owed
                    ? "text-sm font-bold tabular-nums text-foreground"
                    : "text-sm tabular-nums text-muted-foreground"
                }
              >
                {whole(bucket.totalMinor)}
              </Text>
            </View>
          )
        })}
      </View>
      {orders.count ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showOrders }}
          className="-mx-3.5 border-t border-border px-3.5 pt-3 active:opacity-80"
          haptic
          onPress={() => setShowOrders((open) => !open)}
        >
          <Text className="text-sm font-bold text-foreground">
            {whole(aging.ordersOwedMinor)} is on {orders.count} unpaid{" "}
            {orders.count === 1 ? "Order" : "Orders"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Not on the statement yet ·{" "}
            {showOrders ? "Hide" : `Show ${orders.count === 1 ? "it" : "them"}`}
          </Text>
        </Pressable>
      ) : null}
      {showOrders ? (
        <ListCard>
          {orders.items.map((order) => (
            <RecordRow
              key={order.orderId}
              title={`Order ${order.orderNumber}`}
              meta={`${new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${owedBucketLabels[order.bucket]}`}
              amount={whole(order.balanceMinor)}
              avatar={{ icon: "Receipt", tint: "amber" }}
              onPress={() =>
                router.push({
                  pathname: "/order/[orderId]",
                  params: { orderId: order.orderId },
                } as Href)
              }
            />
          ))}
        </ListCard>
      ) : null}
    </View>
  )
}
