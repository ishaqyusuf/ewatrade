import type { ReactNode } from "react"
import type { LayoutChangeEvent } from "react-native"
import type {
  ConversionBalance,
  ConversionProjection,
} from "./unit-conversion-model"
export type ConversionHeaderProps = { storeName: string }
export type ConversionSectionProps = {
  onLayout?: (event: LayoutChangeEvent) => void
  title: string
  description?: string
  children: ReactNode
}
export type ConversionRowProps = {
  row: ConversionBalance
  selected: boolean
  disabled: boolean
  onPress: () => void
}
export type ConversionSummaryProps = {
  source: ConversionBalance
  target: ConversionBalance
  projection: ConversionProjection
}
