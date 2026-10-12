import type {
  ConversionBalance,
  ConversionProjection,
} from "./unit-conversion-model"
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
