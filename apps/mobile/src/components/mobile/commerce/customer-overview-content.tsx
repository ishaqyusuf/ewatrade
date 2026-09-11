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
import { useRef, useState, type ReactNode } from "react"
import { CustomerOrderHistory } from "../customer-book/customer-order-history"
import { ScrollView } from "react-native"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import {
  ClassicCustomerProfile,
  ClassicCustomerMetrics,
  ClassicCustomerInformation,
} from "../appearances/classic/customer-profile"
import {
  MarketDayCustomerProfile,
  MarketDayCustomerMetrics,
  MarketDayCustomerInformation,
  MarketDayCustomerNavigation,
} from "../appearances/market-day/customer-profile"
import { type CommerceCustomer } from "./commerce-model"
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
  const [activeTab, setActiveTab] = useState<CustomerOverviewTab>("information")
  const emptyTab =
    activeTab === "information" || activeTab === "orders"
      ? null
      : EMPTY_TAB_CONTENT[activeTab]
  const visibleTabs = orderLinked
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
        orderLinked ? "gap-5 px-4 pb-12" : "gap-6 px-4 pb-12"
      }
      refreshControl={isOffline ? undefined : <QueryRefreshControl />}
      showsVerticalScrollIndicator={false}
      testID="customer-overview-screen"
    >
      {headerContent}
      {market ? (
        <MarketDayCustomerNavigation
          onBack={onBack}
          onClose={orderLinked ? onClose : undefined}
        />
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
      <Metrics customer={customer} historyComplete={historyComplete} />

      {market || (!appearance && orderLinked) ? (
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

      {!historyComplete ? (
        <Text className={"text-xs font-semibold " + muted}>
          {historyNotice}
        </Text>
      ) : null}

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
                    ? "text-sm font-extrabold " +
                      (market ? "text-market-accent-ink" : "text-primary")
                    : "text-sm font-semibold " + muted
                }
              >
                {tab.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

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
                className={"font-market-display text-2xl " + ink}
              >
                {emptyTab.title}
              </Text>
              <Text className={"text-sm leading-6 " + muted}>
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
