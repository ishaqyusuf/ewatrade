"use client"

import type { SessionUser } from "@/lib/session"
import { getUserInitials } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import { cn } from "@/utils"
import {
  Analytics01Icon,
  Archive01Icon,
  Home01Icon,
  Logout01Icon,
  Package01Icon,
  Settings01Icon,
  ShoppingCart01Icon,
  Store04Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

type NavItem = {
  label: string
  href: string
  // biome-ignore lint/suspicious/noExplicitAny: HugeIcons icon data type
  icon: any
  end?: boolean
}

const STORE_NAV: NavItem[] = [
  { label: "Overview", href: "/", icon: Home01Icon, end: true },
  { label: "Products", href: "/products", icon: Package01Icon },
  { label: "Orders", href: "/orders", icon: ShoppingCart01Icon },
  { label: "Inventory", href: "/inventory", icon: Archive01Icon },
  { label: "Analytics", href: "/analytics", icon: Analytics01Icon },
  { label: "Settings", href: "/settings", icon: Settings01Icon },
]

type Props = {
  user: SessionUser
  ctx: TenantContext
}

export function DashboardSidebar({ user, ctx }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const initials = getUserInitials(user)

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push(process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com")
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo + store name */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
          <HugeiconsIcon
            icon={Store04Icon}
            className="size-4 text-primary-foreground"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {ctx.activeStore?.name ?? ctx.tenant.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {ctx.tenant.slug}.ewatrade.com
          </p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        {STORE_NAV.map((item) => {
          const isActive = item.end
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user.displayName ??
                (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                  user.email)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <HugeiconsIcon
            icon={UserCircle02Icon}
            className="size-4 shrink-0 text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <HugeiconsIcon icon={Logout01Icon} className="size-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
