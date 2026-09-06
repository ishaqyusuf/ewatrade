import { MobileScreen } from "@/components/mobile/screen"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useEffect } from "react"
import type { CommercialOrder } from "./commerce"
import {
  CommercialOrderOverviewContent,
  CommercialOrderOverviewPrimaryAction,
} from "./commerce/commercial-order-overview"
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
  orderNumber: "#2040",
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
  theme,
}: {
  theme: "dark" | "light"
}) {
  const { setColorScheme } = useColorScheme()
  useEffect(() => setColorScheme(theme), [setColorScheme, theme])

  return (
    <View className="flex-1 bg-background">
      <MobileScreen contentClassName="gap-7 pb-32" scroll>
        <CommercialOrderOverviewContent
          activity={buildCommercialOrderActivity(CURRENT_ORDER_FIXTURE)}
          error={null}
          isFulfillingAll={false}
          isOffline={false}
          notice={null}
          onBack={inert}
          onFulfillAll={inert}
          onFulfillLine={inert}
          onOpenCustomer={inert}
          order={CURRENT_ORDER_FIXTURE}
        />
      </MobileScreen>
      <CommercialOrderOverviewPrimaryAction disabled={false} onPress={inert} />
    </View>
  )
}
