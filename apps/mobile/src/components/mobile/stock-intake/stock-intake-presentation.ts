import type { ReactNode } from "react"
import type { IconKeys } from "@/components/ui/icon"

export type StockChoiceProps = {
  label: string
  onPress: () => void
  selected: boolean
  disabled: boolean
}
export type StockRowProps = {
  title: string
  subtitle: string
  quantityLabel: string
  icon: IconKeys
  selected: boolean
  disabled: boolean
  onPress: () => void
}
export type StockSectionProps = {
  title: string
  description?: string
  children: ReactNode
}
export type StockHeaderProps = { storeName: string; description: string }
