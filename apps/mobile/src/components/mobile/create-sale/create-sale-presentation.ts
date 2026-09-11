import type { CommerceCustomer } from "@/components/mobile/commerce"
import type { OfferingRow } from "./create-sale-model"
import type { useCreateSale } from "./use-create-sale"
import type { MobileDesign } from "@/lib/mobile-design/screens"

export type CreateSaleViewModel = ReturnType<typeof useCreateSale>
export type SaleStepViewProps = {
  model: CreateSaleViewModel
  appearance: MobileDesign
  actionsHeight: number
  onActionsHeightChange: (height: number) => void
}

export type SaleStageHeaderProps = {
  current: number
  description: string
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
  quantity?: string
}
export type CustomerActionRowProps = {
  description: string
  icon: "UserPlus" | "UserX"
  onPress: () => void
  title: string
}
export type CustomerSuggestionRowProps = {
  customer: CommerceCustomer
  onPress: () => void
}
export type SaleTotalProps = { helper?: string; label: string; value: string }
