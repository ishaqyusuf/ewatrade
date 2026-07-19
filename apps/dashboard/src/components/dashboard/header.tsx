"use client"

import { DashboardCommandSearch } from "@/components/dashboard/command-search"
import { type DashboardNavItem, getDashboardRoleLabel } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import { getUserInitials } from "@/lib/user-display"
import { clearDashboardDataCache } from "@/trpc/client"
import { cn } from "@/utils"
import { Avatar, AvatarFallback, Button } from "@ewatrade/ui"
import { Logout01Icon, Store04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

type Props = {
  ctx: TenantContext
  navItems: DashboardNavItem[]
  user: SessionUser
}

export function DashboardHeader({ ctx, navItems, user }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [isSwitchingTenant, setIsSwitchingTenant] = useState(false)
  const [isSwitchingStore, setIsSwitchingStore] = useState(false)
  const activeItem =
    navItems.find((item) =>
      item.end
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? navItems[0]
  const initials = getUserInitials(user)
  const roleLabel = getDashboardRoleLabel(ctx.membership.role)

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push(
      `${process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"}/login`,
    )
  }

  async function handleStoreChange(storeId: string) {
    if (!storeId || storeId === ctx.activeStore?.id) return

    setIsSwitchingStore(true)

    try {
      const response = await fetch("/api/stores/active", {
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })

      if (response.ok) {
        clearDashboardDataCache()
        window.location.assign(pathname)
      }
    } finally {
      setIsSwitchingStore(false)
    }
  }

  async function handleTenantChange(tenantId: string) {
    if (!tenantId || tenantId === ctx.tenant.id) return

    setIsSwitchingTenant(true)

    try {
      const response = await fetch("/api/tenants/active", {
        body: JSON.stringify({ tenantId, path: pathname }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = response.ok
        ? ((await response.json()) as { dashboardUrl?: string | null })
        : null

      if (result?.dashboardUrl) {
        clearDashboardDataCache()
        window.location.assign(result.dashboardUrl)
        return
      }

      if (response.ok) {
        clearDashboardDataCache()
        window.location.assign(pathname)
      }
    } finally {
      setIsSwitchingTenant(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[70px] items-center gap-4 border-b border-border bg-background/90 px-4 backdrop-blur-xl md:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {activeItem?.description ?? "Retail operations dashboard"}
        </p>
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
          {activeItem?.label ?? "Dashboard"}
        </h1>
      </div>

      <DashboardCommandSearch navItems={navItems} />

      <div className="hidden items-center gap-2 xl:flex">
        <HugeiconsIcon
          icon={Store04Icon}
          className="size-4 text-muted-foreground"
        />
        <select
          value={ctx.tenant.id}
          disabled={ctx.tenants.length < 2 || isSwitchingTenant}
          onChange={(event) => handleTenantChange(event.target.value)}
          className={cn(
            "h-9 max-w-[180px] rounded-full border border-border bg-background px-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-70",
            ctx.tenants.length < 2 ? "appearance-none" : "",
          )}
        >
          {ctx.tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>

        <select
          value={ctx.activeStore?.id ?? ""}
          disabled={ctx.stores.length < 2 || isSwitchingStore}
          onChange={(event) => handleStoreChange(event.target.value)}
          className={cn(
            "h-9 max-w-[180px] rounded-full border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-70",
            ctx.stores.length < 2 ? "appearance-none" : "",
          )}
        >
          {ctx.stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden min-w-0 max-w-[180px] text-right lg:block">
        <p className="truncate text-xs font-medium text-foreground">
          {user.displayName ??
            (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
              user.email)}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {roleLabel}
        </p>
      </div>

      <Avatar className="bg-primary/10">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleLogout}
        aria-label="Sign out"
        title="Sign out"
      >
        <HugeiconsIcon icon={Logout01Icon} className="size-4" />
      </Button>
    </header>
  )
}
