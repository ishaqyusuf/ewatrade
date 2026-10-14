import type { BusinessActivityCategory } from "@ewatrade/notifications/business-events"
import { cn } from "@ewatrade/ui"
import {
  BankIcon,
  FileImportIcon,
  Message01Icon,
  PackageIcon,
  Settings02Icon,
  ShoppingCart01Icon,
  Tag01Icon,
  UserAdd01Icon,
  UserGroupIcon,
  Wallet01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const ICONS = {
  orders: ShoppingCart01Icon,
  payments: Wallet01Icon,
  staff: UserAdd01Icon,
  inventory: PackageIcon,
  catalog: Tag01Icon,
  services: Wrench01Icon,
  customers: UserGroupIcon,
  finance: BankIcon,
  communications: Message01Icon,
  settings: Settings02Icon,
  imports: FileImportIcon,
} satisfies Record<BusinessActivityCategory, unknown>

export function ActivityCategoryIcon({
  category,
  className,
}: {
  category: BusinessActivityCategory
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center border bg-muted text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={ICONS[category]} className="size-4" />
    </span>
  )
}
