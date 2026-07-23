import { FormField } from "@/components/mobile/form-field";
import { Icon } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { View } from "@/components/ui/view";
import { formatMinorMoney } from "@ewatrade/utils";
import { useMemo, useState } from "react";
import {
  DESIGN_01_ORDERS,
  type Design01OrderStatus,
  getDesign01OrderTotal,
} from "./design-01-commerce.data";
import {
  Design01CommerceListShell,
  Design01FilterChip,
  Design01MetricTile,
  Design01OrderRow,
  Design01PageHeader,
} from "./design-01-commerce-primitives";
import {
  DESIGN_01_COMMERCE_REFERENCE,
  DESIGN_01_ROUTES,
} from "./design-01.data";

type DateFilter = "Today" | "7 days" | "30 days";
type StatusFilter = "All" | Design01OrderStatus;

const PREVIEW_TODAY = new Date("2026-07-22T23:59:59.999Z");

export function Design01OrdersScreen() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("30 days");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const dayCount =
      dateFilter === "Today" ? 1 : dateFilter === "7 days" ? 7 : 30;
    const cutoff = new Date(PREVIEW_TODAY);
    cutoff.setUTCDate(cutoff.getUTCDate() - dayCount);

    return DESIGN_01_ORDERS.filter((order) => {
      const matchesDate = new Date(order.createdAt) > cutoff;
      const matchesStatus =
        statusFilter === "All" || order.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${order.number} ${order.lines.map((line) => line.name).join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesDate && matchesStatus && matchesQuery;
    });
  }, [dateFilter, query, statusFilter]);
  const totalValue = DESIGN_01_ORDERS.reduce(
    (total, order) => total + getDesign01OrderTotal(order),
    0,
  );
  const itemCount = DESIGN_01_ORDERS.reduce(
    (total, order) =>
      total + order.lines.reduce((count, line) => count + line.quantity, 0),
    0,
  );

  return (
    <Design01CommerceListShell
      data={visibleOrders}
      emptyMessage="Try a different date, status, or search term."
      emptyTitle="No matching orders"
      header={
        <View className="gap-5 pb-4">
          <Design01PageHeader
            action={
              <Pressable
                accessibilityLabel="Open customers preview"
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
                haptic
                href={DESIGN_01_ROUTES.customers}
              >
                <Icon className="size-base text-foreground" name="Users" />
              </Pressable>
            }
            subtitle="Review payment and fulfilment at a glance."
            title="Orders"
          />
          <FormField
            autoCapitalize="none"
            label="Search"
            leadingIcon="Search"
            onChangeText={setQuery}
            placeholder="Search order or item"
            value={query}
          />
          <View className="flex-row flex-wrap gap-2">
            {(["Today", "7 days", "30 days"] as const).map((value) => (
              <Design01FilterChip
                active={dateFilter === value}
                key={value}
                label={value}
                onPress={() => setDateFilter(value)}
              />
            ))}
          </View>
          <View className="flex-row gap-3">
            <Design01MetricTile
              icon="ReceiptText"
              label="Orders"
              value={String(DESIGN_01_ORDERS.length)}
            />
            <Design01MetricTile
              icon="ListChecks"
              label="Ordered items"
              value={String(itemCount)}
            />
          </View>
          <View className="flex-row gap-3">
            <Design01MetricTile
              icon="Calculator"
              label="Average value"
              value={formatMinorMoney(
                Math.round(totalValue / DESIGN_01_ORDERS.length),
                "NGN",
              )}
            />
            <Design01MetricTile
              icon="Wallet"
              label="Total value"
              value={formatMinorMoney(totalValue, "NGN")}
            />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {(["All", "Open", "Completed", "Cancelled"] as const).map(
              (value) => (
                <Design01FilterChip
                  active={statusFilter === value}
                  key={value}
                  label={value}
                  onPress={() => setStatusFilter(value)}
                />
              ),
            )}
          </View>
        </View>
      }
      keyExtractor={(order) => order.id}
      reference={DESIGN_01_COMMERCE_REFERENCE}
      renderItem={({ item }) => <Design01OrderRow order={item} />}
      testID="design-01-orders-screen"
    />
  );
}
