import {
  CommerceFirstOrderGate,
  CommercePendingOrderRow,
  type CommercialOrder,
} from "@/components/mobile/commerce"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { OrdersDispatchLedgerQaState } from "@/lib/orders-dispatch-ledger-qa"
import { useEffect } from "react"
import { View } from "react-native"
import { MobileAppShell } from "./app-shell"
import { EmptyState } from "./empty-state"
import {
  OrdersDispatchFilterRow,
  OrdersDispatchLedgerMasthead,
  OrdersDispatchLedgerRow,
  OrdersDispatchLedgerSummary,
} from "./orders-dispatch-ledger"
import { StatusBanner } from "./status-banner"

const inert = () => undefined

function fixtureOrder(
  input: Partial<CommercialOrder> & Pick<CommercialOrder, "id">,
): CommercialOrder {
  return {
    amountPaidMinor: 0,
    balanceDueMinor: 48_500_00,
    clientOrderId: `client-${input.id}`,
    createdAt: new Date("2026-09-06T10:30:00.000Z"),
    currencyCode: "NGN",
    customerEmail: null,
    customerName: "Amina Yusuf",
    customerPhone: null,
    discountMinor: 0,
    lines: [
      {
        kind: "product",
        quantity: "3",
        snapshot: { catalogItemName: "Market stock" },
      } as CommercialOrder["lines"][number],
    ],
    notes: null,
    orderNumber: `#${input.id}`,
    payments: [],
    paymentStatus: "PAID",
    serviceChargeMinor: 0,
    status: "CONFIRMED",
    storeId: "store-1",
    subtotalMinor: 48_500_00,
    taxMinor: 0,
    totalMinor: 48_500_00,
    ...input,
  }
}

const POPULATED_ORDERS = [
  fixtureOrder({ id: "2041" }),
  fixtureOrder({
    customerName: "Emeka Stores",
    id: "2040",
    lines: [
      {
        kind: "product",
        quantity: "7",
        snapshot: { catalogItemName: "Delivery stock" },
      } as CommercialOrder["lines"][number],
    ],
    paymentStatus: "PARTIALLY_PAID",
    status: "FULFILLING",
    totalMinor: 126_000_00,
  }),
  fixtureOrder({
    customerName: null,
    id: "2039",
    lines: [
      {
        kind: "product",
        quantity: "2",
        snapshot: { catalogItemName: "Counter sale" },
      } as CommercialOrder["lines"][number],
    ],
    paymentStatus: "PENDING",
    status: "READY_FOR_PICKUP",
    totalMinor: 18_400_00,
  }),
]

export function OrdersDispatchLedgerQaScreen({
  state,
  theme,
}: {
  state: OrdersDispatchLedgerQaState
  theme: "dark" | "light"
}) {
  const { setColorScheme } = useColorScheme()
  const marketDay = useMarketDayPalette()

  useEffect(() => {
    setColorScheme(theme)
  }, [setColorScheme, theme])

  const orders = state === "populated" ? POPULATED_ORDERS : []
  const firstOrder = state === "first-order"
  const pending = state === "pending-sync" || state === "offline"

  return (
    // biome-ignore lint/a11y/useValidAriaRole: MobileAppShell uses an app-specific permission role prop.
    <MobileAppShell
      key={`orders-dispatch-${state}-${theme}`}
      backgroundColor={marketDay.canvas}
      businessName="Northstar Trading Company"
      centralAction={{ icon: "Plus", label: "+", onPress: inert }}
      contentStyle={{
        backgroundColor: marketDay.canvas,
        gap: 16,
        paddingHorizontal: 20,
        paddingTop: firstOrder ? 20 : 0,
      }}
      hero={
        <OrdersDispatchLedgerMasthead
          businessName="Northstar"
          onCustomersPress={inert}
        />
      }
      heroStatusBarStyle="dark"
      keyboardBottomOffset={12}
      navItems={[
        { icon: "home", label: "Home", onPress: inert },
        {
          icon: "ReceiptText",
          isActive: true,
          label: "Orders",
          onPress: inert,
        },
        { icon: "Warehouse", label: "Catalog", onPress: inert },
        { icon: "more", label: "More", onPress: inert },
      ]}
      role="owner"
      scrolledStatusBarColor={marketDay.canvas}
      scrolledStatusBarStyle={theme === "dark" ? "light" : "dark"}
      showHeader={false}
      statusBarColor={marketDay.marigold}
      statusBarFollowsHero
      title="Orders"
    >
      {!firstOrder ? (
        <View style={{ marginHorizontal: -20 }}>
          <OrdersDispatchLedgerSummary dateFilter="30_days" orders={orders} />
        </View>
      ) : null}

      {state === "offline" ? (
        <StatusBanner
          icon="Wind"
          message="Showing cached Orders and device work. Payment and fulfilment actions require a connection."
          title="Offline mode"
          tone="warning"
        />
      ) : state === "error" ? (
        <StatusBanner
          icon="AlertCircle"
          message="Orders could not be loaded. Pull to refresh."
          title="Orders unavailable"
          tone="destructive"
        />
      ) : state === "loading" ? (
        <StatusBanner icon="Loader2" message="Loading Commercial Orders." />
      ) : null}

      {firstOrder ? (
        <CommerceFirstOrderGate catalogReady onPrimaryPress={inert} />
      ) : (
        <>
          <OrdersDispatchFilterRow
            active="30_days"
            labels={{
              "30_days": "30 days",
              "7_days": "7 days",
              all: "All time",
              today: "Today",
            }}
            onChange={inert}
            values={["today", "7_days", "30_days", "all"]}
          />
          <OrdersDispatchFilterRow
            active="all"
            labels={{ all: `All ${orders.length}`, completed: "Done" }}
            onChange={inert}
            values={["all", "open", "completed", "cancelled"]}
          />
        </>
      )}

      {pending ? (
        <CommercePendingOrderRow
          order={{
            clientCommandId: "queued-2042",
            createdAtClient: new Date("2026-09-06T11:00:00.000Z"),
            customerName: "Queued customer",
            lineCount: 2,
          }}
        />
      ) : null}

      {orders.map((order, index) => (
        <OrdersDispatchLedgerRow
          index={index}
          key={order.id}
          onPress={inert}
          order={order}
        />
      ))}

      {!firstOrder && !pending && orders.length === 0 ? (
        <EmptyState
          icon="ReceiptText"
          message={
            state === "filtered-empty"
              ? "Try another date, search, or status filter."
              : "New Product and Service Orders will appear here."
          }
          title={
            state === "filtered-empty" ? "No matching orders" : "No orders yet"
          }
        />
      ) : null}
    </MobileAppShell>
  )
}
