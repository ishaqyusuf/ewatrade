import { ActionButton } from "@/components/mobile/action-button"
import { ReturnableBadge } from "@/components/mobile/create-sale/checkout-returnables"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ScrollView } from "react-native"
import { returnableCount, useReturnableBalances } from "./use-returnables"

const LATE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export function daysOut(oldestOutAt: string | null, now = Date.now()) {
  return oldestOutAt
    ? Math.max(0, Math.floor((now - Date.parse(oldestOutAt)) / DAY_MS))
    : 0
}

export function daysOutLabel(days: number) {
  return days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`
}

/** Every customer still holding returnables, biggest first. */
export function ReturnablesScreen() {
  const router = useRouter()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const balances = useReturnableBalances({})
  const [lateOnly, setLateOnly] = useState(false)
  const rows = balances.data ?? []
  const shown = lateOnly
    ? rows.filter((row) => daysOut(row.oldestOutAt) > LATE_DAYS)
    : rows
  const items = [...new Set(rows.map((row) => row.itemName))]
  const totals = items.map(
    (name) =>
      [
        name,
        rows
          .filter((row) => row.itemName === name)
          .reduce((sum, row) => sum + row.out, 0),
      ] as const,
  )
  const customers = new Set(rows.map((row) => row.customerId)).size
  const late = rows.filter((row) => daysOut(row.oldestOutAt) > LATE_DAYS)
  const openReturn = (customerId?: string, catalogItemId?: string) =>
    router.push({
      params: { catalogItemId, customerId },
      pathname: "/returnable-return",
    })

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="gap-3 px-[18px] pb-10"
        showsVerticalScrollIndicator={false}
      >
        {isOffline ? (
          <StatusBanner
            icon="WifiOff"
            message="Reconnect to see what customers hold."
            title="You're offline"
            tone="warning"
          />
        ) : null}
        {balances.isError ? (
          <StatusBanner
            actionLabel="Try again"
            icon="AlertCircle"
            message="Couldn't load returnables."
            onActionPress={() => void balances.refetch()}
            tone="warning"
          />
        ) : null}
        {balances.isPending && !isOffline ? (
          <View className="gap-3" accessibilityLabel="Loading returnables">
            <Skeleton className="h-28 rounded-[24px]" />
            <Skeleton className="h-16 rounded-[18px]" />
            <Skeleton className="h-16 rounded-[18px]" />
          </View>
        ) : balances.isSuccess && !rows.length ? (
          <View className="items-center gap-2 rounded-[20px] bg-card px-4 py-8 shadow-sm">
            <ReturnableBadge />
            <Text className="text-base font-extrabold text-foreground">
              Nothing out with customers
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              Crates and other returnables sent with orders show here until they
              come back.
            </Text>
          </View>
        ) : rows.length ? (
          <>
            <View className="gap-1 rounded-[24px] bg-primary px-[18px] py-4">
              <Text className="text-xs font-bold text-primary-foreground/80">
                Out with customers
              </Text>
              {totals.map(([name, total]) => (
                <Text
                  className="text-2xl font-extrabold tabular-nums text-primary-foreground"
                  key={name}
                >
                  {returnableCount(total, name)}
                </Text>
              ))}
              <Text className="text-sm text-primary-foreground/80">
                {`${customers} ${customers === 1 ? "customer" : "customers"}${late.length ? ` · ${late.length} over ${LATE_DAYS} days` : ""}`}
              </Text>
            </View>
            <View className="flex-row gap-2">
              {(
                [
                  [false, "All"],
                  [true, `Over ${LATE_DAYS} days`],
                ] as const
              ).map(([value, label]) => {
                const on = lateOnly === value
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className={cn(
                      "min-h-9 justify-center rounded-full border-[1.5px] bg-card px-3.5 shadow-sm",
                      on ? "border-primary" : "border-transparent",
                    )}
                    haptic="selection"
                    key={label}
                    onPress={() => setLateOnly(value)}
                  >
                    <Text
                      className={cn(
                        "text-xs font-extrabold",
                        on ? "text-primary" : "text-foreground",
                      )}
                    >
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <View className="overflow-hidden rounded-[20px] bg-card shadow-sm">
              {shown.length ? (
                shown.map((row, index) => {
                  const days = daysOut(row.oldestOutAt)
                  return (
                    <Pressable
                      accessibilityHint="Opens Record return"
                      accessibilityRole="button"
                      className={cn(
                        "min-h-[60px] flex-row items-center gap-3 px-3.5 py-3",
                        index > 0 && "border-t border-border",
                      )}
                      haptic
                      key={`${row.customerId}:${row.catalogItemId}`}
                      onPress={() =>
                        openReturn(row.customerId, row.catalogItemId)
                      }
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-bold text-foreground">
                          {row.customerName}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {items.length > 1
                            ? row.itemName
                            : `${row.orderCount} ${row.orderCount === 1 ? "order" : "orders"}`}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-base font-extrabold tabular-nums text-foreground">
                          {row.out}
                        </Text>
                        <Text
                          className={cn(
                            "text-xs font-bold",
                            days > LATE_DAYS
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {daysOutLabel(days)}
                        </Text>
                      </View>
                      <Icon
                        className="size-[18px] text-muted-foreground"
                        name="ChevronRight"
                      />
                    </Pressable>
                  )
                })
              ) : (
                <Text className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                  {`Nothing out over ${LATE_DAYS} days.`}
                </Text>
              )}
            </View>
            <ActionButton
              disabled={isOffline}
              icon="Undo2"
              onPress={() => openReturn()}
            >
              Record return
            </ActionButton>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}
