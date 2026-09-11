import type { OrderFulfilmentConfirmation } from "@/lib/order-action-sheet-model"

export type OrderActionSummaryProps = { label: string; value: string }
export type OrderActionStackProps = {
  actionLabel: string
  cancelLabel?: string
  disabled?: boolean
  isLoading?: boolean
  loadingLabel?: string
  onCancel: () => void
  onConfirm: () => void
}
export type OrderPaymentChoiceProps = {
  label: string
  selected: boolean
  onPress: () => void
}
export type OrderConfirmationDetailProps = {
  presentation: OrderFulfilmentConfirmation
}
