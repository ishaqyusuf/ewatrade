import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import type { CommercialOrderActivity } from "@/components/mobile/commerce/commercial-order-overview-model"
import type { ReactNode } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

export type OrderDetailContentProps = {
  activity: CommercialOrderActivity[]
  businessName: string
  error: string | null
  fulfillingOrderLineId?: string
  isFulfillingAll: boolean
  isOffline: boolean
  notice: string | null
  onBack: () => void
  onFulfillAll: () => void
  onFulfillLine: (orderLineId: string) => void
  onMastheadHeightChange?: (height: number) => void
  onOpenCustomer: () => void
  order: CommercialOrder
}

export type OrderDetailPrimaryActionProps = {
  disabled: boolean
  onPress: () => void
  order: CommercialOrder
}

export type OrderDetailScreenProps = {
  children: ReactNode
  hasBalanceDue: boolean
  mastheadVisible: boolean
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}
