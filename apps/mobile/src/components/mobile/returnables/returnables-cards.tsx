import { ActionButton } from "@/components/mobile/action-button"
import { ReturnableBadge } from "@/components/mobile/create-sale/checkout-returnables"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useRouter } from "expo-router"
import { daysOut, daysOutLabel } from "./returnables-screen"
import {
  returnableCount,
  useOrderReturnables,
  useReturnableBalances,
  useReturnableItems,
} from "./use-returnables"

function openReturn(
  router: ReturnType<typeof useRouter>,
  params: { customerId: string; catalogItemId?: string; orderId?: string },
) {
  router.push({ params, pathname: "/returnable-return" })
}

/** Order detail: returnables that went out with this order. Hidden when none. */
export function OrderReturnablesCard({
  orderId,
  isOffline,
}: {
  orderId: string
  isOffline: boolean
}) {
  const router = useRouter()
  const colors = useColors()
  const query = useOrderReturnables(orderId)
  const customerId = query.data?.customerId
  if (!query.data?.items.length) return null
  return (
    <View className="gap-2" testID="order-returnables">
      <Text className="text-xs font-extrabold uppercase tracking-[0.3px] text-muted-foreground">
        Returnables
      </Text>
      {query.data.items.map((item) => {
        const back = item.returned + item.writtenOff
        const out = Math.max(0, item.issued - back)
        return (
          <View
            className="gap-3 rounded-[20px] bg-card px-3.5 py-3.5 shadow-sm"
            key={item.catalogItemId}
          >
            <View className="flex-row items-end justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-bold text-muted-foreground">
                  {item.itemName}
                </Text>
                <Text className="text-3xl font-extrabold tabular-nums text-foreground">
                  {out}
                  <Text className="text-sm font-bold text-muted-foreground">
                    {" still out"}
                  </Text>
                </Text>
              </View>
              {out === 0 ? (
                <View className="flex-row items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1">
                  <Icon className="size-[14px] text-primary" name="Check" />
                  <Text className="text-xs font-extrabold text-primary">
                    All back
                  </Text>
                </View>
              ) : (
                <ReturnableBadge />
              )}
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View
                // `style` drops className styles on this View, so all of it goes in style.
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 999,
                  height: "100%",
                  width: `${item.issued ? Math.min(100, (back / item.issued) * 100) : 0}%`,
                }}
              />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs font-bold text-muted-foreground">
                {`Went out ${item.issued}`}
              </Text>
              <Text className="text-xs font-bold text-muted-foreground">
                {item.writtenOff
                  ? `Back ${item.returned} · Lost ${item.writtenOff}`
                  : `Back ${item.returned}`}
              </Text>
            </View>
            {out > 0 && customerId ? (
              <ActionButton
                disabled={isOffline}
                icon="Undo2"
                onPress={() =>
                  openReturn(router, {
                    catalogItemId: item.catalogItemId,
                    customerId,
                    orderId,
                  })
                }
                variant="outline"
              >
                Record return
              </ActionButton>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

/** Customer profile: what this customer still holds. Hidden when nothing is out. */
export function CustomerReturnablesCard({
  customerId,
  isOffline,
}: {
  customerId?: string
  isOffline: boolean
}) {
  const router = useRouter()
  const query = useReturnableBalances({
    customerId,
    enabled: Boolean(customerId),
  })
  if (!customerId || !query.data?.length) return null
  return (
    <View
      className="gap-3 rounded-[20px] bg-card px-3.5 py-3.5 shadow-sm"
      testID="customer-returnables"
    >
      <Text className="text-sm font-extrabold text-foreground">
        Returnables
      </Text>
      {query.data.map((row) => (
        <View className="flex-row items-center gap-3" key={row.catalogItemId}>
          <ReturnableBadge />
          <View className="min-w-0 flex-1">
            <Text className="text-base font-extrabold tabular-nums text-foreground">
              {`${returnableCount(row.out, row.itemName)} out`}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {`Oldest ${daysOutLabel(daysOut(row.oldestOutAt)).toLowerCase()}${row.orderCount ? ` · ${row.orderCount} ${row.orderCount === 1 ? "order" : "orders"}` : ""}`}
            </Text>
          </View>
        </View>
      ))}
      <ActionButton
        disabled={isOffline}
        icon="Undo2"
        onPress={() =>
          openReturn(router, {
            catalogItemId:
              query.data.length === 1
                ? query.data[0]?.catalogItemId
                : undefined,
            customerId,
          })
        }
        variant="outline"
      >
        Record return
      </ActionButton>
    </View>
  )
}

/** Customers directory: a way into Returnables for businesses that use them. */
export function ReturnablesEntryRow() {
  const router = useRouter()
  const items = useReturnableItems()
  const balances = useReturnableBalances({
    enabled: Boolean(items.data?.length),
  })
  if (!items.data?.length) return null
  const rows = balances.data ?? []
  const out = rows.reduce((sum, row) => sum + row.out, 0)
  const customers = new Set(rows.map((row) => row.customerId)).size
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[60px] flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm"
      haptic
      onPress={() => router.push("/returnables-modal")}
      testID="returnables-entry"
    >
      <ReturnableBadge />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground">Returnables</Text>
        <Text className="text-xs text-muted-foreground">
          {out
            ? `${out} out with ${customers} ${customers === 1 ? "customer" : "customers"}`
            : "Nothing out with customers"}
        </Text>
      </View>
      <Icon className="size-[18px] text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}
