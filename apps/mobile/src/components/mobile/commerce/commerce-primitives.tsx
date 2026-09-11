import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReactNode } from "react"
import { StatusBadge } from "../status-badge"
import {
  type CommerceCustomer,
  type CommercialOrder,
  type PendingCommerceOrder,
  commerceLineTitle,
  commerceOrderItemCount,
  commerceOrderTone,
  commercePaymentTone,
  commerceStatusLabel,
  customerOrderCount,
  customerValueLabel,
  formatCommerceDate,
  formatCommerceQuantity,
} from "./commerce-model"

export function CommercePageHeader({
  action,
  onBack,
  subtitle,
  title,
}: {
  action?: ReactNode
  onBack?: () => void
  subtitle?: string
  title: string
}) {
  return (
    <View className="gap-3">
      <View className="min-h-11 flex-row items-center gap-3">
        {onBack ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
            haptic
            onPress={onBack}
          >
            <Icon className="size-base text-foreground" name="ArrowLeft" />
          </Pressable>
        ) : null}
        <View className="min-w-0 flex-1">
          <Text className="text-3xl font-extrabold tracking-tight text-foreground">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-1 text-sm leading-5 text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
    </View>
  )
}

export function CommerceFilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        "min-h-11 min-w-20 items-center justify-center rounded-xl px-5",
        active
          ? "bg-foreground"
          : "border border-border bg-card active:bg-accent",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-sm font-bold",
          active ? "text-background" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function CommerceMetricTile({
  icon,
  label,
  value,
}: {
  icon: IconKeys
  label: string
  value: string
}) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-secondary p-4">
      <View className="flex-row items-center gap-2">
        <Icon className="size-sm text-primary" name={icon} />
        <Text className="text-xs font-bold text-muted-foreground">{label}</Text>
      </View>
      <Text
        className="mt-3 text-xl font-extrabold tracking-tight text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

export function CommerceFirstOrderGate({
  catalogReady,
  onPrimaryPress,
}: {
  catalogReady: boolean
  onPrimaryPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const facts = [
    { label: "Orders", value: "0" },
    { label: "Value", value: "₦0" },
    { label: "Items", value: "0" },
  ]

  return (
    <View className="gap-5">
      <View className="overflow-hidden rounded-3xl bg-primary p-5">
        <Text className="text-[11px] font-extrabold uppercase tracking-[1.7px] text-primary-foreground/75">
          Before your first order
        </Text>
        <Text className="mt-3 text-2xl font-extrabold tracking-tight text-primary-foreground">
          {catalogReady
            ? "Your first order is ready to start."
            : "Orders start with an item."}
        </Text>
        <Text className="mt-2 text-sm leading-5 text-primary-foreground/80">
          {catalogReady
            ? "Your catalog is ready. Create a sale to begin payment and fulfilment tracking."
            : "Add one Product or Service. Then this screen becomes your live order ledger."}
        </Text>

        <View className="mt-5 border-y border-primary-foreground/20">
          <CommerceOrderGateStep
            complete={catalogReady}
            current={!catalogReady}
            detail={
              catalogReady
                ? "Priced and ready to sell."
                : "Name it and set a price."
            }
            icon={catalogReady ? "CheckCircle2" : "FolderPlus"}
            label={catalogReady ? "Catalog is ready" : "Create what you sell"}
            step="01"
          />
          <CommerceOrderGateStep
            current={catalogReady}
            detail={
              catalogReady
                ? "Record payment and fulfilment together."
                : "Unlocks after step 01."
            }
            disabled={!catalogReady}
            icon={catalogReady ? "ReceiptText" : "Lock"}
            label="Take the first order"
            step="02"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          className="mt-5 min-h-[52px] items-center justify-center rounded-2xl bg-primary-foreground px-5 active:opacity-90"
          haptic
          onPress={onPrimaryPress}
        >
          <Text className="text-center text-sm font-extrabold text-primary">
            {catalogReady ? "Create first order" : "Add a Product or Service"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-3">
        <View
          className={cn(
            largeTextLayout
              ? "gap-1"
              : "flex-row items-center justify-between gap-3",
          )}
        >
          <Text className="text-lg font-extrabold tracking-tight text-foreground">
            Order snapshot
          </Text>
          <Text
            className="text-xs text-muted-foreground"
            numberOfLines={largeTextLayout ? 2 : 1}
          >
            Nothing recorded yet
          </Text>
        </View>
        <View
          className={cn(
            "border-y border-border",
            largeTextLayout ? "py-1" : "flex-row py-4",
          )}
        >
          {facts.map((fact, index) => (
            <View
              className={cn(
                largeTextLayout
                  ? "min-h-14 flex-row items-center justify-between gap-4 py-2"
                  : "min-w-0 flex-1 px-4",
                !largeTextLayout && index > 0 && "border-l border-border",
                !largeTextLayout && index === 0 && "pl-0",
                largeTextLayout && index > 0 && "border-t border-border",
              )}
              key={fact.label}
            >
              {largeTextLayout ? (
                <>
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {fact.label}
                  </Text>
                  <Text
                    className="min-w-0 flex-1 text-right text-xl font-extrabold tracking-tight text-foreground"
                    numberOfLines={2}
                  >
                    {fact.value}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    className="text-xl font-extrabold tracking-tight text-foreground"
                    numberOfLines={1}
                  >
                    {fact.value}
                  </Text>
                  <Text className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {fact.label}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>
      </View>

      <View className="flex-row items-center gap-3">
        <View className="size-9 items-center justify-center rounded-full bg-muted">
          <Icon className="size-sm text-primary" name="Info" />
        </View>
        <Text className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">
          Date, status, and search filters appear when there is order history to
          review.
        </Text>
      </View>
    </View>
  )
}

function CommerceOrderGateStep({
  complete = false,
  current = false,
  detail,
  disabled = false,
  icon,
  label,
  step,
}: {
  complete?: boolean
  current?: boolean
  detail: string
  disabled?: boolean
  icon: IconKeys
  label: string
  step: string
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      className={cn(
        "min-h-16 flex-row gap-3 border-b border-primary-foreground/20 py-3 last:border-b-0",
        largeTextLayout ? "items-start" : "items-center",
        disabled && "opacity-55",
      )}
    >
      <Text
        className={cn(
          "shrink-0 text-xs font-extrabold text-primary-foreground/70",
          largeTextLayout ? "w-9" : "w-6",
        )}
        numberOfLines={1}
      >
        {step}
      </Text>
      <View
        className={cn(
          "size-9 shrink-0 items-center justify-center rounded-full",
          current || complete
            ? "bg-primary-foreground"
            : "bg-primary-foreground/15",
        )}
      >
        <Icon
          className={cn(
            "size-sm",
            current || complete ? "text-primary" : "text-primary-foreground",
          )}
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-extrabold text-primary-foreground">{label}</Text>
        <Text className="text-xs text-primary-foreground/70">{detail}</Text>
      </View>
    </View>
  )
}

export function CommerceOrderRow({
  className,
  onPress,
  order,
}: {
  className?: string
  onPress: () => void
  order: CommercialOrder
}) {
  const itemCount = commerceOrderItemCount(order)

  return (
    <Pressable
      accessibilityLabel={`Open ${order.orderNumber}`}
      accessibilityRole="button"
      className={cn("border-b border-border py-4 active:bg-accent", className)}
      haptic
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <View className="size-2 rounded-full bg-primary" />
            <Text className="font-extrabold text-foreground">
              {order.orderNumber}
            </Text>
          </View>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {order.customerName || order.customerPhone || "Walk-in customer"} ·{" "}
            {formatCommerceDate(order.createdAt)}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {formatCommerceQuantity(itemCount)}{" "}
            {itemCount === 1 ? "item" : "items"} ·{" "}
            {order.lines.map(commerceLineTitle).join(", ")}
          </Text>
        </View>
        <View className="max-w-[48%] items-end gap-2">
          <Text className="font-extrabold text-foreground">
            {formatMinorMoney(order.totalMinor, order.currencyCode)}
          </Text>
          <View className="flex-row flex-wrap justify-end gap-1.5">
            <StatusBadge
              className="min-h-7 px-2.5 py-0"
              label={commerceStatusLabel(order.paymentStatus)}
              tone={commercePaymentTone(order.paymentStatus)}
            />
            <StatusBadge
              className="min-h-7 px-2.5 py-0"
              label={commerceStatusLabel(order.status)}
              tone={commerceOrderTone(order.status)}
            />
          </View>
        </View>
      </View>
    </Pressable>
  )
}

export function CommercePendingOrderRow({
  order,
}: {
  order: PendingCommerceOrder
}) {
  return (
    <View className="border-b border-border py-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">Queued order</Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {order.customerName || order.customerPhone || "Walk-in customer"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {order.lineCount} {order.lineCount === 1 ? "item" : "items"} ·{" "}
            {formatCommerceDate(order.createdAtClient)}
          </Text>
        </View>
        <StatusBadge label="Pending sync" tone="warning" />
      </View>
    </View>
  )
}

export function CommerceCustomerRow({
  className,
  customer,
  historyComplete = true,
  onPress,
}: {
  className?: string
  customer: CommerceCustomer
  historyComplete?: boolean
  onPress: () => void
}) {
  const orderCount = customerOrderCount(customer)
  const isPendingOnly =
    customer.orders.length === 0 && customer.pendingOrders.length > 0
  const hasNoOrders = orderCount === 0

  return (
    <Pressable
      accessibilityLabel={`Open ${customer.name}`}
      accessibilityRole="button"
      className={cn("border-b border-border py-4 active:bg-accent", className)}
      haptic
      onPress={onPress}
    >
      <View className="flex-row items-start gap-3">
        <View className="size-12 items-center justify-center rounded-full bg-primary">
          <Text className="text-sm font-extrabold text-primary-foreground">
            {customer.initials}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 font-extrabold text-foreground">
              {customer.name}
            </Text>
            <StatusBadge
              className="min-h-7 px-2.5 py-0"
              label={
                hasNoOrders
                  ? "Saved"
                  : isPendingOnly
                    ? "Pending sync"
                    : "Synced"
              }
              tone={
                hasNoOrders ? "primary" : isPendingOnly ? "warning" : "success"
              }
            />
          </View>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {customer.phone ?? customer.email ?? "No contact details"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {hasNoOrders ? (
              "No orders yet"
            ) : (
              <>
                {historyComplete ? "" : "Loaded · "}
                {customerValueLabel(customer)} order value · {orderCount}{" "}
                {orderCount === 1 ? "order" : "orders"}
              </>
            )}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

export function CommerceSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <View className="gap-2">
      <Text className="text-lg font-extrabold text-foreground">{title}</Text>
      <View className="overflow-hidden rounded-2xl bg-card px-4">
        {children}
      </View>
    </View>
  )
}

export function CommerceInfoRow({
  detail,
  icon,
  title,
}: {
  detail: string
  icon: IconKeys
  title: string
}) {
  return (
    <View className="flex-row items-start gap-3 border-b border-border py-4 last:border-b-0">
      <View className="size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-bold text-foreground">{title}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {detail}
        </Text>
      </View>
    </View>
  )
}

export function CommerceTotalRow({
  emphasized = false,
  label,
  value,
}: {
  emphasized?: boolean
  label: string
  value: string
}) {
  return (
    <View className="flex-row items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <Text
        className={
          emphasized
            ? "font-extrabold text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </Text>
      <Text
        className={
          emphasized
            ? "text-lg font-extrabold text-foreground"
            : "text-sm font-bold text-foreground"
        }
      >
        {value}
      </Text>
    </View>
  )
}
