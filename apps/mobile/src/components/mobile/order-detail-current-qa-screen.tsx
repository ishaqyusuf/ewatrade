import {
  OrderDetailDispatchDocket,
  OrderDetailDispatchDocketPrimaryAction,
} from "@/components/mobile/order-detail-dispatch-docket"
import { MobileScreen } from "@/components/mobile/screen"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { StatusBar } from "expo-status-bar"
import { useEffect, useMemo, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import type { CommercialOrder } from "./commerce"
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
  state,
  theme,
}: {
  state: "offline" | "paid" | "populated" | "scheduled"
  theme: "dark" | "light"
}) {
  const { colorScheme, setColorScheme } = useColorScheme()
  const marketDay = useMarketDayPalette()
  const [mastheadHeight, setMastheadHeight] = useState(116)
  const [mastheadVisible, setMastheadVisible] = useState(true)
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
  const safeAreaColor = mastheadVisible ? marketDay.marigold : marketDay.canvas

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextVisible = event.nativeEvent.contentOffset.y < mastheadHeight - 8
    setMastheadVisible((current) =>
      current === nextVisible ? current : nextVisible,
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
          onFulfillAll={inert}
          onFulfillLine={inert}
          onMastheadHeightChange={setMastheadHeight}
          onOpenCustomer={inert}
          order={order}
        />
      </MobileScreen>
      {order.balanceDueMinor > 0 ? (
        <OrderDetailDispatchDocketPrimaryAction
          disabled={state === "offline"}
          onPress={inert}
          order={order}
        />
      ) : null}
    </View>
  )
}
