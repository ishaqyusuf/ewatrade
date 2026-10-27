import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import type { CommercialOrderActivity } from "@/components/mobile/commerce/commercial-order-overview-model"
import type { ApprovalBanner } from "@/components/mobile/order-detail/order-change-approval-model"
import type { ReactNode } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

export type OrderDetailContentProps = {
  activity: CommercialOrderActivity[]
  /** Return/refund requests waiting on this order, for approver or requester. */
  approvalBanners?: ApprovalBanner[]
  onApprovalBanner?: (banner: ApprovalBanner) => void
  businessName: string
  cachedAt?: string
  onReceipt?: () => void
  onCall?: () => void
  onMessage?: () => void
  /** WhatsApp action beside Call and Message: readiness, never "sent". */
  whatsApp?: ReactNode
  /** After a committed payment, refund or cancellation: tell the customer. */
  messageFollowUp?: ReactNode
  /** Opens the Change sheet; absent while the order cannot load its options. */
  onChange?: () => void
  /** Opens the bank-transfer Payment link page; absent with nothing due. */
  onPaymentLink?: () => void
  /** Ask AI about this order; absent when the business has no assistant. */
  assistant?: { disabled: boolean; onPress: () => void }
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
