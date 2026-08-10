"use client"

import { cn } from "@/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

const items = [
  { href: "/settings", label: "General" },
  { href: "/settings/domains", label: "Domains" },
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/service-commerce", label: "Service Commerce" },
  { href: "/settings/prescriptions", label: "Prescriptions" },
  { href: "/settings/billing", label: "Billing" },
]

export function SettingsNavigation() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings"
      className="flex gap-1 overflow-x-auto border-b border-border px-6 lg:px-8"
    >
      {items.map((item) => {
        const active =
          item.href === "/settings"
            ? pathname === item.href
            : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "border-b-2 px-3 py-4 text-sm font-medium transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
