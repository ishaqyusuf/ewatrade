import { Icon, type IconKeys } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { cn } from "@/lib/utils";
import { formatMinorMoney } from "@ewatrade/utils";
import type { ReactNode } from "react";
import { StatusBadge } from "../status-badge";
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
} from "./commerce-model";

export function CommercePageHeader({
  action,
  onBack,
  subtitle,
  title,
}: {
  action?: ReactNode;
  onBack?: () => void;
  subtitle?: string;
  title: string;
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
  );
}

export function CommerceFilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        "min-h-11 justify-center rounded-xl px-4",
        active ? "bg-foreground" : "border border-border bg-card",
      )}
      haptic
      onPress={onPress}
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
  );
}

export function CommerceMetricTile({
  icon,
  label,
  value,
}: {
  icon: IconKeys;
  label: string;
  value: string;
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
  );
}

export function CommerceOrderRow({
  onPress,
  order,
}: {
  onPress: () => void;
  order: CommercialOrder;
}) {
  const itemCount = commerceOrderItemCount(order);

  return (
    <Pressable
      accessibilityLabel={`Open ${order.orderNumber}`}
      accessibilityRole="button"
      className="border-b border-border py-4 active:bg-accent"
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
  );
}

export function CommercePendingOrderRow({
  order,
}: {
  order: PendingCommerceOrder;
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
  );
}

export function CommerceCustomerRow({
  customer,
  historyComplete = true,
  onPress,
}: {
  customer: CommerceCustomer;
  historyComplete?: boolean;
  onPress: () => void;
}) {
  const orderCount = customerOrderCount(customer);
  const isPendingOnly = customer.orders.length === 0;

  return (
    <Pressable
      accessibilityLabel={`Open ${customer.name}`}
      accessibilityRole="button"
      className="border-b border-border py-4 active:bg-accent"
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
              label={isPendingOnly ? "Pending sync" : "Synced"}
              tone={isPendingOnly ? "warning" : "success"}
            />
          </View>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {customer.phone ?? customer.email ?? "No contact details"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {historyComplete ? "" : "Loaded · "}
            {customerValueLabel(customer)} order value · {orderCount}{" "}
            {orderCount === 1 ? "order" : "orders"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function CommerceSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View className="gap-2">
      <Text className="text-lg font-extrabold text-foreground">{title}</Text>
      <View className="overflow-hidden rounded-2xl bg-card px-4">
        {children}
      </View>
    </View>
  );
}

export function CommerceInfoRow({
  detail,
  icon,
  title,
}: {
  detail: string;
  icon: IconKeys;
  title: string;
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
  );
}

export function CommerceTotalRow({
  emphasized = false,
  label,
  value,
}: {
  emphasized?: boolean;
  label: string;
  value: string;
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
  );
}
