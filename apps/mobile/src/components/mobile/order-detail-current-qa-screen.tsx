import {
  OrderFulfilmentConfirmationSheet,
  type OrderPaymentMethod,
  OrderPaymentSheet,
} from "@/components/mobile/order-action-sheet"
import {
  OrderDetailDispatchDocket,
  OrderDetailDispatchDocketPrimaryAction,
} from "@/components/mobile/order-detail-dispatch-docket"
import { MobileScreen } from "@/components/mobile/screen"
import { useModal } from "@/components/ui/modal"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { getOrderFulfilmentConfirmation } from "@/lib/order-action-sheet-model"
import { formatMinorMoney, minorToMajorInput } from "@ewatrade/utils"
import { StatusBar } from "expo-status-bar"
import { useEffect, useMemo, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import {
  type CommerceCustomer,
  type CommercialOrder,
  CustomerOverviewContent,
} from "./commerce"
import { buildCommercialOrderActivity } from "./commerce/commercial-order-overview-model"

const inert = () => undefined

const CURRENT_ORDER_FIXTURE = {
  amountPaidMinor: 48_500_00,
  balanceDueMinor: 77_500_00,
  clientOrderId: "baseline-order-2040",
  createdAt: new Date("2026-09-06T08:52:00.000Z"),
  createdBy: {
    email: "owner@northstar.example",
    id: "owner-1",
    name: "Tola Adeyemi",
    role: "OWNER",
  },
  currencyCode: "NGN",
  customerEmail: "orders@emeka.example",
  customerName: "Emeka Stores",
  customerPhone: "+234 803 555 0142",
  deliveryDueAt: new Date("2026-09-06T11:30:00.000Z"),
  discountMinor: 5_000_00,
  id: "order-2040",
  lines: [
    {
      discountMinor: 5_000_00,
      id: "line-rice",
      kind: "product",
      productFulfillments: [],
      productReturns: [],
      quantity: "5",
      reservation: { id: "reservation-1", status: "ACTIVE" },
      snapshot: {
        catalogItemName: "Ofada rice",
        inventoryUnitName: "25 kg bag",
        offeringName: "Wholesale bag",
        variantName: "Premium",
      },
      taxMinor: 0,
      totalMinor: 95_000_00,
      unitPriceMinor: 20_000_00,
    },
    {
      discountMinor: 0,
      id: "line-delivery",
      kind: "service",
      productFulfillments: [],
      productReturns: [],
      quantity: "1",
      reservation: null,
      snapshot: {
        catalogItemName: "Market delivery",
        offeringName: "Same-day delivery",
        variantName: "Mainland route",
      },
      taxMinor: 0,
      totalMinor: 31_000_00,
      unitPriceMinor: 31_000_00,
    },
  ],
  notes: "Call Amina at the receiving desk before dispatch.",
  orderNumber: ["#", "2040"].join(""),
  payments: [],
  paymentStatus: "PARTIALLY_PAID",
  serviceChargeMinor: 0,
  status: "CONFIRMED",
  storeId: "store-1",
  subtotalMinor: 126_000_00,
  taxMinor: 0,
  totalMinor: 126_000_00,
} as CommercialOrder

export function OrderDetailCurrentQaScreen({
  action = null,
  state,
  theme,
}: {
  action?: "customer" | "fulfil-all" | "fulfil-line" | "payment" | null
  state: "offline" | "paid" | "populated" | "scheduled"
  theme: "dark" | "light"
}) {
  const { colorScheme, setColorScheme } = useColorScheme()
  const marketDay = useMarketDayPalette()
  const paymentModal = useModal()
  const fulfilLineModal = useModal()
  const fulfilAllModal = useModal()
  const [mastheadHeight, setMastheadHeight] = useState(116)
  const [mastheadVisible, setMastheadVisible] = useState(true)
  const [activeAction, setActiveAction] = useState(action)
  const [selectedLineId, setSelectedLineId] = useState("line-rice")
  const [amountPaid, setAmountPaid] = useState(
    minorToMajorInput(CURRENT_ORDER_FIXTURE.balanceDueMinor),
  )
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>("cash")
  const [paymentReference, setPaymentReference] = useState("")
  useEffect(() => setColorScheme(theme), [setColorScheme, theme])
  const order = useMemo(() => {
    if (state === "paid") {
      return {
        ...CURRENT_ORDER_FIXTURE,
        amountPaidMinor: CURRENT_ORDER_FIXTURE.totalMinor,
        balanceDueMinor: 0,
        paymentStatus: "PAID",
      } as CommercialOrder
    }
    if (state === "scheduled") {
      return {
        ...CURRENT_ORDER_FIXTURE,
        deliveryDueAt: new Date("2027-09-06T11:30:00.000Z"),
      } as CommercialOrder
    }
    return CURRENT_ORDER_FIXTURE
  }, [state])
  const linePresentation = useMemo(
    () =>
      getOrderFulfilmentConfirmation(order, {
        kind: "line",
        orderLineId: selectedLineId,
      }),
    [order, selectedLineId],
  )
  const allPresentation = useMemo(
    () => getOrderFulfilmentConfirmation(order, { kind: "all" }),
    [order],
  )
  const safeAreaColor = mastheadVisible ? marketDay.marigold : marketDay.canvas

  useEffect(() => {
    setActiveAction(action)
    if (!action || action === "customer") return
    const timer = setTimeout(() => {
      if (action === "payment") paymentModal.present()
      if (action === "fulfil-line") fulfilLineModal.present()
      if (action === "fulfil-all") fulfilAllModal.present()
    }, 180)
    return () => clearTimeout(timer)
  }, [
    action,
    fulfilAllModal.present,
    fulfilLineModal.present,
    paymentModal.present,
  ])

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextVisible = event.nativeEvent.contentOffset.y < mastheadHeight - 8
    setMastheadVisible((current) =>
      current === nextVisible ? current : nextVisible,
    )
  }

  if (activeAction === "customer") {
    const customer = {
      currencyTotals: [
        {
          currencyCode: order.currencyCode,
          totalMinor: order.totalMinor,
        },
      ],
      email: order.customerEmail ?? null,
      id: "customer-emeka",
      initials: "ES",
      name: order.customerName ?? "Customer",
      orders: [order],
      pendingOrders: [],
      phone: order.customerPhone ?? null,
    } satisfies CommerceCustomer

    return (
      <View className="flex-1 bg-background pt-4">
        <CustomerOverviewContent
          customer={customer}
          onBack={() => setActiveAction(null)}
          onClose={() => setActiveAction(null)}
          onCreateOrder={inert}
          onOpenOrder={inert}
          orderLinked
        />
      </View>
    )
  }

  return (
    <View style={{ backgroundColor: marketDay.canvas, flex: 1 }}>
      <StatusBar
        backgroundColor={safeAreaColor}
        style={mastheadVisible || colorScheme === "light" ? "dark" : "light"}
      />
      <MobileScreen
        backgroundColor={marketDay.canvas}
        contentClassName={order.balanceDueMinor > 0 ? "pb-32" : "pb-12"}
        onScroll={handleScroll}
        safeAreaColor={safeAreaColor}
        scroll
      >
        <OrderDetailDispatchDocket
          activity={buildCommercialOrderActivity(order)}
          businessName="Northstar"
          error={null}
          isFulfillingAll={false}
          isOffline={state === "offline"}
          notice={null}
          onBack={inert}
          onFulfillAll={() => {
            setActiveAction("fulfil-all")
            fulfilAllModal.present()
          }}
          onFulfillLine={(orderLineId) => {
            setSelectedLineId(orderLineId)
            setActiveAction("fulfil-line")
            fulfilLineModal.present()
          }}
          onMastheadHeightChange={setMastheadHeight}
          onOpenCustomer={() => setActiveAction("customer")}
          order={order}
        />
      </MobileScreen>
      {order.balanceDueMinor > 0 ? (
        <OrderDetailDispatchDocketPrimaryAction
          disabled={state === "offline"}
          onPress={() => {
            setActiveAction("payment")
            paymentModal.present()
          }}
          order={order}
        />
      ) : null}
      <OrderPaymentSheet
        amountPaid={amountPaid}
        balanceLabel={formatMinorMoney(
          order.balanceDueMinor,
          order.currencyCode,
        )}
        currencyCode={order.currencyCode}
        error={null}
        isLoading={false}
        isOffline={state === "offline"}
        onAmountPaidChange={setAmountPaid}
        onCancel={paymentModal.dismiss}
        onConfirm={inert}
        onPaymentMethodChange={setPaymentMethod}
        onReferenceChange={setPaymentReference}
        paymentMethod={paymentMethod}
        reference={paymentReference}
        ref={paymentModal.ref}
      />
      <OrderFulfilmentConfirmationSheet
        error={null}
        isLoading={false}
        onCancel={fulfilLineModal.dismiss}
        onConfirm={inert}
        presentation={linePresentation}
        ref={fulfilLineModal.ref}
      />
      <OrderFulfilmentConfirmationSheet
        error={null}
        isLoading={false}
        onCancel={fulfilAllModal.dismiss}
        onConfirm={inert}
        presentation={allPresentation}
        ref={fulfilAllModal.ref}
      />
    </View>
  )
}
