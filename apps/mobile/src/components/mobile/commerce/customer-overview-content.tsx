import {
  ActionButton,
  MarketDayActionButton,
} from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { type ReactNode, useRef, useState } from "react"
import { Linking, ScrollView } from "react-native"
import {
  ClassicCustomerInformation,
  ClassicCustomerMetrics,
  ClassicCustomerProfile,
} from "../appearances/classic/customer-profile"
import {
  MarketDayCustomerInformation,
  MarketDayCustomerMetrics,
  MarketDayCustomerNavigation,
  MarketDayCustomerProfile,
} from "../appearances/market-day/customer-profile"
import { CustomerOrderHistory } from "../customer-book/customer-order-history"
import { QuickActionRow } from "../green-till/kit"
import type { CommerceCustomer } from "./commerce-model"
import { CommercePageHeader } from "./commerce-primitives"

const CUSTOMER_OVERVIEW_TABS = [
  { key: "information", label: "Information" },
  { key: "orders", label: "Orders" },
  { key: "wishlist", label: "Wishlist" },
  { key: "reviews", label: "Reviews" },
  { key: "loyalty", label: "Loyalty" },
  { key: "insights", label: "Insights" },
] as const

type CustomerOverviewTab = (typeof CUSTOMER_OVERVIEW_TABS)[number]["key"]

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
}

export function CustomerOverviewContent({
  customer,
  appearance,
  headerContent,
  historyComplete = true,
  historyNotice = "Only loaded history is shown; totals may change as more orders arrive.",
  isOffline = false,
  onBack,
  onClose,
  onCreateOrder,
  onOpenOrder,
  onStatement,
  orderLinked = false,
}: {
  customer: CommerceCustomer
  appearance?: MobileDesign
  headerContent?: ReactNode
  historyComplete?: boolean
  historyNotice?: string
  isOffline?: boolean
  onBack: () => void
  onClose?: () => void
  onCreateOrder: () => void
  onOpenOrder: (orderId: string) => void
  onStatement?: () => void
  orderLinked?: boolean
}) {
  const scroll = useRef<ScrollView>(null)
  const historyTop = useRef(0)
  const market = appearance === "market-day"
  const Profile = market ? MarketDayCustomerProfile : ClassicCustomerProfile
  const Metrics = market ? MarketDayCustomerMetrics : ClassicCustomerMetrics
  const Information = market
    ? MarketDayCustomerInformation
    : ClassicCustomerInformation
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  const [activeTab, setActiveTab] = useState<CustomerOverviewTab>(
    market ? "information" : "orders",
  )
  const emptyTab =
    activeTab === "information" || activeTab === "orders"
      ? null
      : EMPTY_TAB_CONTENT[activeTab]
  const visibleTabs = !market
    ? ([
        { key: "orders", label: "Orders" },
        { key: "information", label: "Details" },
      ] as const)
    : orderLinked
      ? CUSTOMER_OVERVIEW_TABS.filter(
          (tab) =>
            tab.key === "information" ||
            tab.key === "orders" ||
            tab.key === "wishlist" ||
            tab.key === "reviews",
        )
      : CUSTOMER_OVERVIEW_TABS

  return (
    <ScrollView
      ref={scroll}
      className={market ? "flex-1 bg-market-canvas" : "flex-1"}
      contentContainerClassName={
        market
          ? orderLinked
            ? "gap-5 px-4 pb-12"
            : "gap-6 px-4 pb-12"
          : "gap-4 px-[18px] pb-12"
      }
      refreshControl={isOffline ? undefined : <QueryRefreshControl />}
      showsVerticalScrollIndicator={false}
      testID="customer-overview-screen"
    >
      {market ? headerContent : null}
      {market ? (
        <MarketDayCustomerNavigation
          onBack={onBack}
          onClose={orderLinked ? onClose : undefined}
        />
      ) : !appearance || appearance === "classic" ? (
        <View className="flex-row items-center gap-2.5 pt-2">
          <Pressable
            accessibilityLabel="Back to customers"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
            haptic
            onPress={onBack}
          >
            <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="min-w-0 flex-1 text-center text-base font-extrabold tracking-tight text-foreground"
          >
            Customer
          </Text>
          {orderLinked && onClose ? (
            <Pressable
              accessibilityLabel="Close customer overview"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
              haptic
              onPress={onClose}
            >
              <Icon className="size-[18px] text-foreground" name="X" />
            </Pressable>
          ) : (
            <View className="size-11" />
          )}
        </View>
      ) : (
        <CommercePageHeader
          action={
            orderLinked && onClose ? (
              <Pressable
                accessibilityLabel="Close customer overview"
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
                haptic
                onPress={onClose}
              >
                <Icon className="size-base text-foreground" name="X" />
              </Pressable>
            ) : null
          }
          onBack={onBack}
          title="Customer overview"
        />
      )}

      <Profile customer={customer} historyComplete={historyComplete} />
      {market ? (
        <Metrics customer={customer} historyComplete={historyComplete} />
      ) : null}

      {!market ? (
        <QuickActionRow
          actions={[
            {
              label: "New order",
              icon: "Plus",
              gold: true,
              onPress: onCreateOrder,
            },
            {
              label: "Call",
              icon: "Phone" as const,
              disabled: !customer.phone,
              onPress: () => {
                if (!customer.phone) return
                void Linking.openURL(`tel:${customer.phone}`).catch(() => {})
              },
            },
            ...(onStatement
              ? [
                  {
                    label: "Statement",
                    icon: "ReceiptText" as const,
                    disabled: isOffline,
                    onPress: onStatement,
                  },
                ]
              : []),
          ]}
        />
      ) : market || (!appearance && orderLinked) ? (
        <MarketDayActionButton
          icon="PlusCircle"
          onPress={onCreateOrder}
          tone="palm"
        >
          Create order for customer
        </MarketDayActionButton>
      ) : (
        <ActionButton icon="PlusCircle" onPress={onCreateOrder}>
          Create order for customer
        </ActionButton>
      )}

      {!market ? headerContent : null}
      {!historyComplete && market ? (
        <Text className={`text-xs font-semibold ${muted}`}>
          {historyNotice}
        </Text>
      ) : null}

      {!market ? (
        <View
          accessibilityRole="tablist"
          className="flex-row gap-1 rounded-[14px] bg-muted p-1"
          testID="customer-overview-tabs"
        >
          {visibleTabs.map((tab) => {
            const selected = activeTab === tab.key
            const count = customer.orders.length + customer.pendingOrders.length
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className={
                  selected
                    ? "min-h-9 flex-1 items-center justify-center rounded-[10px] bg-card px-2 shadow-sm"
                    : "min-h-9 flex-1 items-center justify-center rounded-[10px] px-2"
                }
                haptic
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  className={
                    selected
                      ? "text-[13px] font-extrabold text-foreground"
                      : "text-[13px] font-extrabold text-muted-foreground"
                  }
                >
                  {tab.key === "orders" && count
                    ? `${tab.label} · ${count}`
                    : tab.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {market ? (
        <ScrollView
          contentContainerClassName={
            market
              ? "gap-5 border-b border-market-line px-1"
              : "gap-5 border-b border-border px-1"
          }
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="customer-overview-tabs"
        >
          {visibleTabs.map((tab) => {
            const selected = activeTab === tab.key
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className={
                  selected
                    ? market
                      ? "min-h-11 justify-center border-b-2 border-market-marigold px-1"
                      : "min-h-11 justify-center border-b-2 border-primary px-1"
                    : "min-h-11 justify-center border-b-2 border-transparent px-1"
                }
                haptic
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  className={
                    selected
                      ? `text-sm font-extrabold ${market ? "text-market-accent-ink" : "text-primary"}`
                      : `text-sm font-semibold ${muted}`
                  }
                >
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      {activeTab === "information" ? (
        <Information customer={customer} historyComplete={historyComplete} />
      ) : null}

      {activeTab === "orders" ? (
        <CustomerOrderHistory
          market={market}
          customer={customer}
          onOpenOrder={onOpenOrder}
          onLayout={(y) => {
            historyTop.current = y
          }}
          onPageChange={() =>
            scroll.current?.scrollTo({ y: historyTop.current, animated: true })
          }
        />
      ) : null}
      {activeTab === "orders" &&
      !market &&
      (customer.orders.length || customer.pendingOrders.length) ? (
        <View className="-mt-3 flex-row items-start gap-1.5 px-0.5">
          <Icon
            className="mt-px size-[14px] text-muted-foreground"
            name="Clock"
          />
          <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
            {isOffline
              ? "Cached history. Reconnect to load current orders."
              : historyComplete
                ? "Every loaded order for this customer."
                : "Loaded orders only. Totals can change as more orders load."}
          </Text>
        </View>
      ) : null}

      {emptyTab ? (
        <View
          className={
            market
              ? "border-y border-market-line py-3"
              : "border-y border-border py-3"
          }
        >
          {market ? (
            <View className="gap-3 py-5">
              <Text
                accessibilityRole="header"
                className={`font-market-display text-2xl ${ink}`}
              >
                {emptyTab.title}
              </Text>
              <Text className={`text-sm leading-6 ${muted}`}>
                {emptyTab.message}
              </Text>
            </View>
          ) : (
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
          )}
        </View>
      ) : null}
    </ScrollView>
  )
}
