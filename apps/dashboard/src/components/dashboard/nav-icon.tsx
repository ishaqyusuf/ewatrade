import type { DashboardNavItem } from "@/lib/navigation"
import {
  Analytics01Icon,
  Archive01Icon,
  BubbleChatIcon,
  Home01Icon,
  Package01Icon,
  Settings01Icon,
  ShoppingCart01Icon,
  SparklesIcon,
  Store04Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const NAV_ICONS = {
  assistant: SparklesIcon,
  analytics: Analytics01Icon,
  customers: UserCircle02Icon,
  conversations: BubbleChatIcon,
  home: Home01Icon,
  inventory: Archive01Icon,
  products: Package01Icon,
  prescriptions: Store04Icon,
  sales: ShoppingCart01Icon,
  services: Store04Icon,
  settings: Settings01Icon,
  staff: UserCircle02Icon,
} satisfies Record<DashboardNavItem["icon"], typeof Home01Icon>

export function NavIcon({
  name,
  className,
}: {
  name: DashboardNavItem["icon"]
  className?: string
}) {
  return (
    <HugeiconsIcon
      aria-hidden="true"
      icon={NAV_ICONS[name]}
      className={className}
    />
  )
}
