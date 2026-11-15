"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
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
import { usePathname } from "next/navigation"

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

function groupItems(items: DashboardNavItem[]) {
  return GROUPS.map((group) => ({
    group,
    items: items.filter((item) => (item.group ?? "Business") === group),
  })).filter(({ items }) => items.length)
}

/**
 * Settings pages: a side list from md up. On phones, /settings opens with the
 * whole list (one tap to any page) and every other page has a back link.
 */
export function SettingsNavigation({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname()
  const groups = groupItems(items)
  const onList = pathname === "/settings"

  return (
    <>
      {onList ? (
        <nav aria-label="Settings pages" className="grid gap-5 md:hidden">
          {groups.map(({ group, items }) => (
            <div key={group} className="grid gap-2">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">
                {group}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
                {items
                  .filter((item) => item.href !== "/settings")
                  .map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-[var(--hover)]"
                      >
                        <HugeiconsIcon
                          icon={ICONS[item.href] ?? Settings02Icon}
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 font-medium">
                          {item.label}
                        </span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
      ) : (
        <Link
          href="/settings"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start justify-self-start rounded-md px-2 font-medium text-muted-foreground hover:text-foreground md:hidden"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          All settings
        </Link>
      )}
      <nav
        aria-label="Settings"
        className="hidden self-start md:sticky md:top-[calc(var(--header-height)+1rem)] md:grid md:gap-4"
      >
        {groups.map(({ group, items }) => (
          <div key={group} className="grid gap-0.5">
            <p className="px-2.5 pb-1 text-sm font-semibold text-muted-foreground">
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
                    "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground",
                    active && "bg-accent font-semibold text-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={ICONS[item.href] ?? Settings02Icon}
                    className="size-4 shrink-0"
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
