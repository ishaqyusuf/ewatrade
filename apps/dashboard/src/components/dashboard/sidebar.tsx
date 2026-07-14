"use client"

import { type DashboardNavItem, getDashboardRoleLabel } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import { getUserInitials } from "@/lib/user-display"
import { cn } from "@/utils"
import {
  Analytics01Icon,
  Archive01Icon,
  Home01Icon,
  Package01Icon,
  Settings01Icon,
  ShoppingCart01Icon,
  Store04Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// biome-ignore lint/suspicious/noExplicitAny: HugeIcons icon data is package-defined.
const NAV_ICONS: Record<DashboardNavItem["icon"], any> = {
  analytics: Analytics01Icon,
  customers: UserCircle02Icon,
  home: Home01Icon,
  inventory: Archive01Icon,
  links: Store04Icon,
  products: Package01Icon,
  sales: ShoppingCart01Icon,
  settings: Settings01Icon,
  staff: UserCircle02Icon,
}

type Props = {
  navItems: DashboardNavItem[]
  user: SessionUser
  ctx: TenantContext
}

export function DashboardSidebar({ navItems, user, ctx }: Props) {
  const pathname = usePathname()
  const initials = getUserInitials(user)
  const roleLabel = getDashboardRoleLabel(ctx.membership.role)

  return (
    <aside className="group/sidebar fixed left-0 top-0 z-40 hidden h-screen w-[70px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pb-4 transition-all duration-200 hover:w-[240px] md:flex">
      <div className="relative flex h-[70px] items-center border-b border-sidebar-border px-[18px]">
        <Link
          href="/"
          aria-label="EwaTrade dashboard home"
          className="flex min-w-0 items-center gap-2"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <HugeiconsIcon
              icon={Store04Icon}
              className="size-5 text-primary-foreground"
            />
          </div>
          <div className="min-w-0 opacity-0 transition-opacity group-hover/sidebar:opacity-100">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              ewatrade
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Dashboard
            </p>
          </div>
        </Link>
      </div>

      <div className="border-b border-sidebar-border px-[18px] py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
            <HugeiconsIcon
              icon={Store04Icon}
              className="size-4 text-sidebar-foreground"
            />
          </div>
          <div className="min-w-0 opacity-0 transition-opacity group-hover/sidebar:opacity-100">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {ctx.tenant.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {ctx.activeStore?.name ?? ctx.tenant.slug}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-0 py-4">
        {navItems.map((item) => {
          const icon = NAV_ICONS[item.icon]
          const isActive = item.end
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className="group block"
            >
              <div className="relative mx-[15px] h-10">
                <div
                  className={cn(
                    "absolute inset-0 border border-transparent transition-colors group-hover:border-sidebar-border group-hover:bg-sidebar-accent",
                    isActive
                      ? "border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground",
                  )}
                />
                <div
                  className={cn(
                    "absolute left-0 top-0 flex size-10 items-center justify-center transition-colors",
                    isActive
                      ? "text-sidebar-primary-foreground"
                      : "text-muted-foreground group-hover:text-sidebar-foreground",
                  )}
                >
                  <HugeiconsIcon icon={icon} className="size-4 shrink-0" />
                </div>
                <div className="absolute left-10 right-2 top-0 flex h-10 items-center overflow-hidden opacity-0 transition-opacity group-hover/sidebar:opacity-100">
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      isActive
                        ? "text-sidebar-primary-foreground"
                        : "text-sidebar-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="px-[18px]">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 opacity-0 transition-opacity group-hover/sidebar:opacity-100">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user.displayName ??
                (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                  user.email)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {roleLabel}
            </p>
          </div>
          <HugeiconsIcon
            icon={UserCircle02Icon}
            className="ml-auto hidden size-4 shrink-0 text-muted-foreground group-hover/sidebar:block"
          />
        </div>
      </div>
    </aside>
  )
}
