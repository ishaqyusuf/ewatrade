import {
  type MobileBottomTab,
  MobileBottomTabs,
} from "@/components/mobile/bottom-tabs"
import type { IconKeys } from "@/components/ui/icon"
import type { LinkProps } from "expo-router"
import type { ReactNode } from "react"

type ReferenceBottomTabBarItem = {
  disabled?: boolean
  href?: LinkProps["href"]
  icon: IconKeys
  label: string
  onPress?: () => void
  render?: (state: { active?: boolean }) => ReactNode
}

type ReferenceBottomTabBarProps = {
  activeLabel?: string
  isHidden?: boolean
  items: ReferenceBottomTabBarItem[]
  referenceTone?: boolean
}

export function ReferenceBottomTabBar({
  activeLabel = "Home",
  isHidden = false,
  items,
  referenceTone = false,
}: ReferenceBottomTabBarProps) {
  const tabs: MobileBottomTab[] = items.map((item) => ({
    disabled: item.disabled,
    href: item.href,
    icon: item.icon,
    label: item.label,
    onPress: item.onPress,
    render: item.render,
  }))

  return (
    <MobileBottomTabs
      activeLabel={activeLabel}
      floating
      haptic
      hideOnScroll
      isHidden={isHidden}
      labelStack="horizontal"
      safeArea
      showLabel={false}
      showLabelOnActive
      tabs={tabs}
      variant={referenceTone ? "reference" : "default"}
    />
  )
}
