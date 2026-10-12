import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReactNode } from "react"
import { StatusBadge } from "../status-badge"
import {
  type CommercialOrder,
  commerceLineTitle,
  commerceOrderItemCount,
  commerceOrderTone,
  commercePaymentTone,
  commerceStatusLabel,
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
