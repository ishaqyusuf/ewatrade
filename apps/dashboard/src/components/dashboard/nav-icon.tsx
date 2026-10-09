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
  UserGroupIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type NavIconName = DashboardNavItem["icon"] | "finance"

const NAV_ICONS = {
  assistant: SparklesIcon,
  analytics: Analytics01Icon,
  customers: UserCircle02Icon,
  conversations: BubbleChatIcon,
  finance: Wallet01Icon,
  home: Home01Icon,
  inventory: Archive01Icon,
  products: Package01Icon,
  prescriptions: Store04Icon,
  sales: ShoppingCart01Icon,
  services: Store04Icon,
  settings: Settings01Icon,
  staff: UserGroupIcon,
} satisfies Record<NavIconName, typeof Home01Icon>

/** Finance shares the "analytics" key with Reports in navigation; give it its own icon. */
export function getNavIconName(item: DashboardNavItem): NavIconName {
  return item.href === "/finance" ? "finance" : item.icon
}

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName
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
