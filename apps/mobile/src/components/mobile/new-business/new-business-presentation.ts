import type { ReactNode } from "react"
import type { BusinessProfile } from "@ewatrade/utils"
export type BusinessSectionProps = {
  title: string
  description?: string
  children: ReactNode
}
export type BusinessChoiceProps = {
  label: string
  selected: boolean
  multiple?: boolean
  disabled: boolean
  onPress: () => void
}
export type BusinessProfileRowProps = {
  profile: BusinessProfile
  selected: boolean
  disabled: boolean
  onPress: () => void
}
export type BusinessSummaryProps = { label: string; value: string }
