"use client"

import { SecondaryMenu } from "@/components/secondary-menu"
import type { DashboardNavItem } from "@/lib/navigation"

export function SettingsNavigation({ items }: { items: DashboardNavItem[] }) {
  return (
    <SecondaryMenu
      items={items.map(({ href: path, label }) => ({ path, label }))}
      label="Settings"
    />
  )
}
