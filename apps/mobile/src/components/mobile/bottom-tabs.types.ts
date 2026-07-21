import type { IconKeys } from "@/components/ui/icon"
import type { LinkProps } from "expo-router"
import type { ReactNode } from "react"

export type MobileBottomTab = {
  accessibilityLabel?: string
  disabled?: boolean
  href?: LinkProps["href"]
  icon: IconKeys
  isActive?: boolean
  kind?: "action" | "navigation"
  label: string
  onPress?: () => void
  render?: (state: { active?: boolean }) => ReactNode
  testID?: string
}

export type MobileBottomTabsProps = {
  activeHref?: LinkProps["href"]
  activeLabel?: string
  floating?: boolean
  hideOnScroll?: boolean
  haptic?: boolean
  isHidden?: boolean
  labelStack?: "horizontal" | "vertical"
  onTabPress?: (
    tab: MobileBottomTab,
    state: { active: boolean; index: number },
  ) => void
  safeArea?: boolean
  showLabel?: boolean
  showLabelOnActive?: boolean
  tabs: MobileBottomTab[]
  variant?: "default" | "operational-detail" | "reference"
}
