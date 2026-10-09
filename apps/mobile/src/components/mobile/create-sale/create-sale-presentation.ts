import type { CommerceCustomer } from "@/components/mobile/commerce"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import type { OfferingRow } from "./create-sale-model"
import type { useCreateSale } from "./use-create-sale"

export type CreateSaleViewModel = ReturnType<typeof useCreateSale>
export type SaleStepViewProps = {
  model: CreateSaleViewModel
  appearance: MobileDesign
  actionsHeight: number
  onActionsHeightChange: (height: number) => void
}

export type SaleStageHeaderProps = {
  current: number
  onBack?: () => void
  title: string
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
export type CustomerActionRowProps = {
  icon: "UserPlus" | "UserX"
  onPress: () => void
  title: string
}
export type CustomerSuggestionRowProps = {
  customer: CommerceCustomer
  onPress: () => void
}
export type SaleTotalProps = { helper?: string; label: string; value: string }
