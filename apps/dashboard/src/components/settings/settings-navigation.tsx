"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import { SelectControl } from "@ewatrade/ui"
import {
  BubbleChatIcon,
  Calendar03Icon,
  CreditCardIcon,
  Globe02Icon,
  Invoice03Icon,
  Notification03Icon,
  ReturnRequestIcon,
  Settings02Icon,
  Shield01Icon,
  Store01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

const GROUPS = ["Business", "Selling", "Customers", "Team", "Pharmacy"] as const

const ICONS: Record<string, typeof Settings02Icon> = {
  "/settings": Settings02Icon,
  "/settings/stores": Store01Icon,
  "/settings/billing": CreditCardIcon,
  "/settings/receipts": Invoice03Icon,
  "/settings/returns": ReturnRequestIcon,
  "/settings/service-commerce": Calendar03Icon,
  "/settings/whatsapp-messages": WhatsappIcon,
  "/settings/domains": Globe02Icon,
  "/settings/channels": BubbleChatIcon,
  "/settings/notifications": Notification03Icon,
  "/settings/compliance": Shield01Icon,
}

/** Settings side list, grouped; a page picker on small screens. */
export function SettingsNavigation({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const groups = GROUPS.map((group) => ({
    group,
    items: items.filter((item) => (item.group ?? "Business") === group),
  })).filter(({ items }) => items.length)
  const current = items.find((item) => item.href === pathname)

  return (
    <>
      <div className="md:hidden">
        <SelectControl
          aria-label="Settings page"
          className="h-10 w-full font-semibold"
          value={current?.href}
          placeholder="Settings"
          options={items.map((item) => ({
            value: item.href,
            label: item.label,
          }))}
          onValueChange={(href) => router.push(href)}
        />
      </div>
      <nav
        aria-label="Settings"
        className="hidden self-start md:sticky md:top-4 md:grid md:gap-[18px]"
      >
        {groups.map(({ group, items }) => (
          <div key={group} className="grid gap-0.5">
            <p className="px-2.5 pb-1 text-xs font-semibold text-muted-foreground">
              {group}
            </p>
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    active && "bg-accent font-semibold text-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={ICONS[item.href] ?? Settings02Icon}
                    className={cn("size-4 shrink-0", active && "text-primary")}
                  />
                  <span className="min-w-0">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </>
  )
}
