import {
  CommercePageHeader,
  type PendingCommerceOrder,
} from "@/components/mobile/commerce"
import { recordAvatar } from "@/components/mobile/dashboard/green-till-home-model"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  GhostPreview,
  SetupSteps,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import {
  ledgerFulfillmentLine,
  ledgerItemsLabel,
  ledgerMoney,
  ledgerPayment,
} from "@/components/mobile/orders/orders-ledger-model"
import type {
  OrdersFilterProps,
  OrdersMastheadProps,
  OrdersRowProps,
  OrdersScreenProps,
  OrdersSummaryProps,
} from "@/components/mobile/orders/orders-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { Text as NativeText } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ClassicOrdersScreen({ children }: OrdersScreenProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--orders-list-top": insets.top + 20,
        "--orders-list-side": 0,
        "--orders-list-bottom": Math.max(insets.bottom + 116, 152),
        "--orders-safe-top": insets.top,
      }}
    >
      <View className="flex-1 bg-background" testID="admin-orders-screen">
        <StatusBar animated style={colorScheme === "dark" ? "light" : "dark"} />
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 z-[100] h-[var(--orders-safe-top)] bg-background"
        />
        {children}
      </View>
    </VariableContextProvider>
  )
}

export function ClassicOrdersMasthead({
  title = "Orders",
  onCustomersPress,
  onSelectReceipts,
  selectingReceipts,
  selectionDisabled,
  onLayout,
}: OrdersMastheadProps) {
  return (
    <View className="px-[18px]" onLayout={onLayout}>
      <CommercePageHeader
        title={title}
        action={
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selectingReceipts
                  ? "Cancel receipt selection"
                  : "Select receipts"
              }
              disabled={selectionDisabled}
              onPress={onSelectReceipts}
              className={cn(
                "min-h-11 flex-row items-center gap-1.5 rounded-full bg-card px-4 shadow-sm active:bg-accent",
                selectionDisabled && "opacity-50",
              )}
            >
              <Icon
                className="size-[16px] text-foreground"
                name={selectingReceipts ? "X" : "CheckSquare"}
              />
              <Text className="text-sm font-bold text-foreground">
                {selectingReceipts ? "Cancel" : "Select"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Open customers"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
              haptic
              onPress={onCustomersPress}
            >
              <Icon className="size-[20px] text-foreground" name="Users" />
            </Pressable>
          </View>
        }
      />
    </View>
  )
}

export function ClassicOrdersSummary({
  orders,
  totalCount,
  dateFilter,
  onDateChange,
  isOffline,
  savedAt,
  loading,
  report,
}: OrdersSummaryProps) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  if (loading)
    return (
      <View className="gap-3 px-[18px]">
        <Skeleton className="h-[220px] rounded-[26px]" />
      </View>
    )
  return (
    <View className="px-[18px]">
      <HeroCard
        label={
          isOffline || !report
            ? `${isOffline ? "Saved" : "Loading"} · ${PERIOD_LABEL[dateFilter]}`
            : `Sales · ${PERIOD_LABEL[dateFilter]}`
        }
        amount={
          isOffline
            ? ledgerMoney(orders)
            : report
              ? wholeMoney(report.orderValueMinor, report.currencyCode)
              : "—"
        }
        sub={
          isOffline
            ? `Saved orders${savedAt ? ` · ${savedAt}` : ""}`
            : report
              ? `${report.orderCount} ${report.orderCount === 1 ? "order" : "orders"}${report.partial ? " · latest orders only" : ""}`
              : "Counting sales…"
        }
        pill={{
          label: isOffline ? "Offline" : "Synced",
          tone: isOffline ? "offline" : "synced",
        }}
        stats={
          isOffline
            ? [
                {
                  label: "Saved orders",
                  value: String(totalCount ?? orders.length),
                },
                {
                  label: "Unpaid",
                  value: ledgerMoney(orders, "balanceDueMinor"),
                  accent: true,
                },
              ]
            : [
                {
                  label: "Orders",
                  value: report ? String(report.orderCount) : "—",
                },
                {
                  label: "Unpaid",
                  value:
                    report?.outstandingMinor === undefined
                      ? "—"
                      : wholeMoney(
                          report.outstandingMinor,
                          report.currencyCode,
                        ),
                  accent: true,
                },
                {
                  label: "Avg order",
                  value: report?.orderCount
                    ? wholeMoney(
                        Math.round(report.orderValueMinor / report.orderCount),
                        report.currencyCode,
                      )
                    : "—",
                },
              ]
        }
      >
        <View className="mt-4 flex-row gap-2">
          {(
            [
              ["today", "Today"],
              ["7_days", "7 days"],
              ["30_days", "30 days"],
              ["all", "All time"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: dateFilter === value }}
              onPress={() => onDateChange?.(value)}
              style={{
                alignItems: "center",
                backgroundColor:
                  dateFilter === value
                    ? palette.heroForeground
                    : palette.heroChip,
                borderRadius: 999,
                flex: 1,
                justifyContent: "center",
                minHeight: 40,
                paddingHorizontal: 6,
              }}
            >
              <NativeText
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{
                  color:
                    dateFilter === value
                      ? palette.heroTo
                      : palette.heroForeground,
                  fontSize: 13,
                  fontWeight: "800",
                }}
              >
                {label}
              </NativeText>
            </Pressable>
          ))}
        </View>
      </HeroCard>
    </View>
  )
}

export function ClassicOrdersSkeleton() {
  return (
    <View className="gap-3">
      {[1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-[88px] rounded-[20px]" />
      ))}
    </View>
  )
}

export function ClassicFirstOrderGate({
  catalogReady,
  onPrimaryPress,
}: { catalogReady: boolean; onPrimaryPress: () => void }) {
  return (
    <View className="gap-4">
      <HeroCard
        label="Before your first order"
        title={
          catalogReady
            ? "Your first order is ready to start."
            : "Orders start with an item."
        }
        sub="Add what you sell, then record your first sale."
        cta={{
          label: catalogReady
            ? "Create first order"
            : "Add a Product or Service",
          onPress: onPrimaryPress,
        }}
      />
      <SetupSteps
        steps={[
          {
            key: "catalog",
            title: "Add what you sell",
            sub: "Name it and set a price.",
            state: catalogReady ? "done" : "now",
            onPress: !catalogReady ? onPrimaryPress : undefined,
          },
          {
            key: "sale",
            title: "Take the first order",
            sub: "Record payment and fulfilment together.",
            state: catalogReady ? "now" : "locked",
            onPress: catalogReady ? onPrimaryPress : undefined,
          },
        ]}
      />
      <GhostPreview
        variant="rows"
        icon="ReceiptText"
        message="Your sales book will appear here."
      />
    </View>
  )
}

export function ClassicOrdersFilterRow<T extends string>({
  active,
  labels,
  onChange,
  values,
}: OrdersFilterProps<T>) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {values.map((value) => {
        const on = active === value
        const [, name = value, count] =
          /^(.*?)(?: (\d+))?$/.exec(labels?.[value] ?? value) ?? []
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={labels?.[value] ?? value}
            accessibilityState={{ selected: on }}
            className={cn(
              "min-h-10 flex-row items-center gap-1.5 rounded-full px-4",
              on ? "bg-foreground" : "bg-card shadow-sm",
            )}
            haptic
            onPress={() => onChange(value)}
          >
            <Text
              className={cn(
                "text-[15px] font-bold",
                on ? "text-background" : "text-foreground",
              )}
            >
              {name}
            </Text>
            {count ? (
              <Text
                className={cn(
                  "text-xs font-bold tabular-nums",
                  on ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {count}
              </Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

export function ClassicOrdersRow({
  order,
  onPress,
  selecting,
  selected,
  disabled,
  index,
  position = { first: true, last: true },
}: OrdersRowProps) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const cancelled = ["CANCELLED", "REFUNDED"].includes(order.status)
  const payment = cancelled
    ? {
        label: order.status === "REFUNDED" ? "Refunded" : "Cancelled",
        tone: "muted" as const,
      }
    : ledgerPayment(order.paymentStatus)
  const avatar = recordAvatar(order.customerName ?? "", index)
  const fulfilment = cancelled ? null : ledgerFulfillmentLine(order.status)
  return (
    <View
      className={cn(
        "bg-card px-3.5",
        position.first && "rounded-t-[20px]",
        position.last && "mb-1 rounded-b-[20px]",
      )}
    >
      <Pressable
        accessibilityRole={selecting ? "checkbox" : "button"}
        accessibilityLabel={`${selecting ? "Select" : "Open"} ${order.orderNumber}, ${order.customerName || "Walk-in"}`}
        accessibilityState={{
          disabled,
          ...(selecting ? { checked: !!selected } : {}),
        }}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          "min-h-[66px] flex-row items-center gap-3 py-3 active:opacity-70",
          !position.last && "border-b border-border",
        )}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette[avatar.tint],
            borderRadius: 999,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          {selecting && selected ? (
            <Icon
              className="size-[20px]"
              color={palette[`${avatar.tint}Foreground`]}
              name="CheckCircle2"
            />
          ) : "icon" in avatar ? (
            <Icon
              className="size-[19px]"
              color={palette[`${avatar.tint}Foreground`]}
              name={avatar.icon}
            />
          ) : (
            <NativeText
              maxFontSizeMultiplier={1.3}
              style={{
                color: palette[`${avatar.tint}Foreground`],
                fontSize: 14,
                fontWeight: "800",
              }}
            >
              {avatar.initials}
            </NativeText>
          )}
        </View>
        <View
          className={cn(
            "min-w-0 flex-1 gap-2",
            !largeText && "flex-row items-center",
          )}
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text
              numberOfLines={1}
              className="text-sm font-bold text-foreground"
            >
              {order.customerName || "Walk-in customer"}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {`${order.orderNumber} · ${ledgerItemsLabel(order)}`}
            </Text>
            {fulfilment ? (
              <View className="flex-row items-center gap-1">
                <Icon
                  className="size-[13px]"
                  color={palette.skyForeground}
                  name={fulfilment.icon}
                />
                <NativeText
                  style={{
                    color: palette.skyForeground,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {fulfilment.label}
                </NativeText>
              </View>
            ) : null}
          </View>
          <View className={cn("gap-1", !largeText && "items-end")}>
            <Text className="text-sm font-bold tabular-nums text-foreground">
              {formatMinorMoney(order.totalMinor, order.currencyCode).replace(
                /\.00$/,
                "",
              )}
            </Text>
            <StatusPill {...payment} />
          </View>
        </View>
      </Pressable>
    </View>
  )
}

const PERIOD_LABEL = {
  today: "Today",
  "7_days": "Last 7 days",
  "30_days": "Last 30 days",
  all: "All time",
} as const

const wholeMoney = (minor: number, currencyCode: string) =>
  formatMinorMoney(minor, currencyCode).replace(/\.00$/, "")

export function ClassicOrdersSection({ children }: { children: ReactNode }) {
  return <View className="gap-[14px] px-[18px]">{children}</View>
}

export function ClassicPendingOrderRow({
  order,
  onPress,
}: { order: PendingCommerceOrder; onPress: () => void }) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open queued order sync status"
      onPress={onPress}
      className="gap-2 rounded-[20px] bg-card p-3.5"
    >
      <View
        className={cn(
          "gap-2",
          !largeText && "flex-row items-center justify-between",
        )}
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-bold text-foreground">
            {order.customerName || "Walk-in"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {order.lineCount} items · Queued order
          </Text>
        </View>
        <StatusPill label="Pending sync" tone="warn" />
      </View>
      <Text className="text-sm font-bold text-foreground">
        {order.displayTotal
          ? formatMinorMoney(
              order.displayTotal.amountMinor,
              order.displayTotal.currencyCode,
            ).replace(/\.00$/, "")
          : "Amount available after sync"}
      </Text>
    </Pressable>
  )
}
