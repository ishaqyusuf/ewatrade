import type { CommerceCustomer } from "@/components/mobile/commerce"
import type { OfferingRow } from "./create-sale-model"
import type { useCreateSale } from "./use-create-sale"

export type CreateSaleViewModel = ReturnType<typeof useCreateSale>
export type SaleStepViewProps = {
  model: CreateSaleViewModel
  actionsHeight: number
  onActionsHeightChange: (height: number) => void
}

export type SelectedOrderLineProps = {
  disabled?: boolean
  offering: OfferingRow
  onQuantityChange: (value: string) => void
  onQuantityBlur: () => void
  onQuantityFocus: () => void
  onRemove: () => void
  /** Classic draws the cart as one card; rows round its first and last edge. */
  position?: { first: boolean; last: boolean }
  quantity?: string
}
export type SaleTopBarProps = {
  onBack?: () => void
  onClose: () => void
  step: number
  subtitle: string
  title: string
}
export type CustomerSuggestionRowProps = {
  customer: CommerceCustomer
  onPress: () => void
}
