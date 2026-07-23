import { EmptyState } from "@/components/mobile/empty-state";
import { Icon, type IconKeys } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useColorScheme, useColors } from "@/hooks/use-color";
import { cn } from "@/lib/utils";
import { formatMinorMoney } from "@ewatrade/utils";
import { StatusBar } from "expo-status-bar";
import type { LinkProps } from "expo-router";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReferenceFabs } from "../../references/reference-fabs";
import {
  type Design01Customer,
  type Design01FulfilmentStatus,
  type Design01Order,
  type Design01PaymentStatus,
  getDesign01Customer,
  getDesign01CustomerOrders,
  getDesign01CustomerValue,
  getDesign01OrderTotal,
} from "./design-01-commerce.data";
import {
  design01CustomerHref,
  design01OrderHref,
  type Design01ReferenceImage,
} from "./design-01.data";

type Design01CommerceListShellProps<T> = {
  data: T[];
  emptyMessage: string;
  emptyTitle: string;
  header: ReactElement;
  keyExtractor: (item: T) => string;
  reference: Design01ReferenceImage;
  renderItem: ListRenderItem<T>;
  testID: string;
};

export function Design01CommerceListShell<T>({
  data,
  emptyMessage,
  emptyTitle,
  header,
  keyExtractor,
  reference,
  renderItem,
  testID,
}: Design01CommerceListShellProps<T>) {
  const colors = useColors();
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const [areFabsHidden, setAreFabsHidden] = useState(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextScrollY = Math.max(event.nativeEvent.contentOffset.y, 0);
      const delta = nextScrollY - lastScrollY.current;

      if (nextScrollY < 20) setAreFabsHidden(false);
      else if (delta > 4) setAreFabsHidden(true);
      else if (delta < -4) setAreFabsHidden(false);

      lastScrollY.current = nextScrollY;
    },
    [],
  );

  return (
    <View className="flex-1 bg-background" testID={testID}>
      <StatusBar
        backgroundColor={colors.background}
        style={colorScheme === "dark" ? "light" : "dark"}
      />
      <FlatList
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom + 116, 148),
          paddingHorizontal: 24,
          paddingTop: insets.top + 20,
        }}
        data={data}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          <EmptyState
            className="mt-6"
            icon="Search"
            message={emptyMessage}
            title={emptyTitle}
          />
        }
        ListHeaderComponent={header}
        onScroll={handleScroll}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      <ReferenceFabs
        isHidden={areFabsHidden}
        secondaryAccessibilityLabel={`Open ${reference.title}`}
        secondaryHref={reference.route}
        secondaryIcon="Camera"
      />
    </View>
  );
}

export function Design01PageHeader({
  action,
  backHref,
  subtitle,
  title,
}: {
  action?: ReactNode;
  backHref?: LinkProps["href"];
  subtitle?: string;
  title: string;
}) {
  return (
    <View className="gap-3">
      <View className="min-h-11 flex-row items-center gap-3">
        {backHref ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
            haptic
            href={backHref}
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

export function Design01FilterChip({
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

export function Design01MetricTile({
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

export function Design01StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "destructive" | "muted" | "primary" | "success" | "warning";
}) {
  const classes = {
    destructive: "bg-destructive text-destructive-foreground",
    muted: "bg-muted text-foreground",
    primary: "bg-primary text-primary-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warn text-warn-foreground",
  }[tone];

  return (
    <View className={cn("min-h-7 justify-center rounded-full px-2.5", classes)}>
      <Text className={cn("text-[11px] font-bold", classes)}>{label}</Text>
    </View>
  );
}

function paymentTone(status: Design01PaymentStatus) {
  if (status === "Paid") return "success" as const;
  if (status === "Refunded") return "destructive" as const;
  return "warning" as const;
}

function fulfilmentTone(status: Design01FulfilmentStatus) {
  if (status === "Fulfilled") return "success" as const;
  if (status === "Cancelled") return "destructive" as const;
  if (status === "Unfulfilled") return "muted" as const;
  return "primary" as const;
}

export function Design01OrderRow({ order }: { order: Design01Order }) {
  const customer = getDesign01Customer(order.customerId);

  return (
    <Pressable
      accessibilityLabel={`Open ${order.number}`}
      accessibilityRole="button"
      className="border-b border-border py-4 pr-16 active:bg-accent"
      haptic
      href={design01OrderHref(order.id)}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <View className="size-2 rounded-full bg-primary" />
            <Text className="font-extrabold text-foreground">
              {order.number}
            </Text>
          </View>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {customer?.name ?? "Walk-in customer"} ·{" "}
            {formatOrderDate(order.createdAt)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {order.lines.length} {order.lines.length === 1 ? "item" : "items"}
          </Text>
        </View>
        <View className="items-end gap-2">
          <Text className="font-extrabold text-foreground">
            {formatMinorMoney(getDesign01OrderTotal(order), order.currencyCode)}
          </Text>
          <View className="flex-row flex-wrap justify-end gap-1.5">
            <Design01StatusPill
              label={order.paymentStatus}
              tone={paymentTone(order.paymentStatus)}
            />
            <Design01StatusPill
              label={order.fulfilmentStatus}
              tone={fulfilmentTone(order.fulfilmentStatus)}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function Design01CustomerRow({
  customer,
}: {
  customer: Design01Customer;
}) {
  const orders = getDesign01CustomerOrders(customer.id);
  const value = getDesign01CustomerValue(customer.id);

  return (
    <Pressable
      accessibilityLabel={`Open ${customer.name}`}
      accessibilityRole="button"
      className="border-b border-border py-4 pr-16 active:bg-accent"
      haptic
      href={design01CustomerHref(customer.id)}
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
            <Design01StatusPill
              label={customer.status}
              tone={customer.status === "Active" ? "success" : "muted"}
            />
          </View>
          <Text className="text-sm text-muted-foreground">
            {customer.location} · {customer.source}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {formatMinorMoney(value, "NGN")} order value · {orders.length}{" "}
            {orders.length === 1 ? "order" : "orders"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function Design01Section({
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

export function Design01InfoRow({
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

export function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
