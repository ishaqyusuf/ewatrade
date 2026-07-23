import { EmptyState } from "@/components/mobile/empty-state";
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control";
import { StatusBadge } from "@/components/mobile/status-badge";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useState } from "react";
import { ScrollView } from "react-native";
import {
  type CommerceCustomer,
  customerOrderCount,
  customerValueLabel,
} from "./commerce-model";
import {
  CommerceInfoRow,
  CommerceMetricTile,
  CommerceOrderRow,
  CommercePageHeader,
  CommercePendingOrderRow,
  CommerceSection,
} from "./commerce-primitives";

const CUSTOMER_OVERVIEW_TABS = [
  { key: "information", label: "Information" },
  { key: "orders", label: "Orders" },
  { key: "wishlist", label: "Wishlist" },
  { key: "reviews", label: "Reviews" },
  { key: "loyalty", label: "Loyalty" },
  { key: "insights", label: "Insights" },
] as const;

type CustomerOverviewTab = (typeof CUSTOMER_OVERVIEW_TABS)[number]["key"];

const EMPTY_TAB_CONTENT: Record<
  Exclude<CustomerOverviewTab, "information" | "orders">,
  { message: string; title: string }
> = {
  insights: {
    message:
      "Customer insights will appear when the production analytics contract is connected.",
    title: "No insights yet",
  },
  loyalty: {
    message:
      "Loyalty activity will appear when a loyalty program is connected to this customer.",
    title: "No loyalty activity",
  },
  reviews: {
    message:
      "Customer reviews will appear when review data is connected to customer profiles.",
    title: "No reviews yet",
  },
  wishlist: {
    message:
      "Saved items will appear when wishlist data is connected to customer profiles.",
    title: "No wishlist items",
  },
};

export function CustomerOverviewContent({
  customer,
  historyComplete = true,
  onBack,
  onOpenOrder,
}: {
  customer: CommerceCustomer;
  historyComplete?: boolean;
  onBack: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const orderCount = customerOrderCount(customer);
  const isPendingOnly = customer.orders.length === 0;
  const [activeTab, setActiveTab] =
    useState<CustomerOverviewTab>("information");
  const emptyTab =
    activeTab === "information" || activeTab === "orders"
      ? null
      : EMPTY_TAB_CONTENT[activeTab];

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-4 pb-12"
      refreshControl={<QueryRefreshControl />}
      showsVerticalScrollIndicator={false}
      testID="customer-overview-screen"
    >
      <CommercePageHeader onBack={onBack} title="Customer overview" />

      <View className="flex-row items-center gap-4">
        <View className="size-16 items-center justify-center rounded-full bg-primary">
          <Text className="text-lg font-extrabold text-primary-foreground">
            {customer.initials}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-2xl font-extrabold text-foreground">
              {customer.name}
            </Text>
            <StatusBadge
              label={isPendingOnly ? "Pending sync" : "Synced"}
              tone={isPendingOnly ? "warning" : "success"}
            />
          </View>
          <Text className="text-sm text-muted-foreground">
            {customer.phone ?? customer.email ?? "No contact details"}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <CommerceMetricTile
          icon="Wallet"
          label={historyComplete ? "Order value" : "Loaded value"}
          value={customerValueLabel(customer)}
        />
        <CommerceMetricTile
          icon="ReceiptText"
          label={historyComplete ? "Total orders" : "Loaded orders"}
          value={String(orderCount)}
        />
      </View>

      {!historyComplete ? (
        <Text className="text-xs font-semibold text-muted-foreground">
          Loading the remaining order history before totals are final…
        </Text>
      ) : null}

      <ScrollView
        contentContainerClassName="gap-5 border-b border-border px-1"
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="customer-overview-tabs"
      >
        {CUSTOMER_OVERVIEW_TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className={
                selected
                  ? "min-h-11 justify-center border-b-2 border-primary px-1"
                  : "min-h-11 justify-center border-b-2 border-transparent px-1"
              }
              haptic
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                className={
                  selected
                    ? "text-sm font-extrabold text-primary"
                    : "text-sm font-semibold text-muted-foreground"
                }
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeTab === "information" ? (
        <CommerceSection title="Customer information">
          <CommerceInfoRow
            detail={customer.phone ?? "Not provided"}
            icon="Phone"
            title="Phone"
          />
          <CommerceInfoRow
            detail={customer.email ?? "Not provided"}
            icon="Mail"
            title="Email"
          />
        </CommerceSection>
      ) : null}

      {activeTab === "orders" ? (
        <View className="gap-2">
          <Text className="text-lg font-extrabold text-foreground">
            Recent orders
          </Text>
          <View className="rounded-2xl bg-card px-4">
            {customer.pendingOrders.map((order) => (
              <CommercePendingOrderRow
                key={order.clientCommandId}
                order={order}
              />
            ))}
            {customer.orders.map((order) => (
              <CommerceOrderRow
                key={order.id}
                onPress={() => onOpenOrder(order.id)}
                order={order}
              />
            ))}
            {orderCount === 0 ? (
              <EmptyState
                icon="ReceiptText"
                message="Orders linked to this customer will appear here."
                title="No orders yet"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {emptyTab ? (
        <View className="border-y border-border py-3">
          <EmptyState
            icon={
              activeTab === "wishlist"
                ? "Pin"
                : activeTab === "reviews"
                  ? "CheckCircle2"
                  : activeTab === "loyalty"
                    ? "ShieldCheck"
                    : "analytics"
            }
            message={emptyTab.message}
            title={emptyTab.title}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
