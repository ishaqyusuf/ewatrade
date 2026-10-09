"use client"

import { DashboardCommandSearch } from "@/components/dashboard/command-search"
import { MobileMenu } from "@/components/dashboard/mobile-menu"
import { UserMenu } from "@/components/dashboard/user-menu"
import { WorkspaceDropdown } from "@/components/dashboard/workspace-dropdown"
import { type DashboardNavItem, getDashboardRoleLabel } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"

type Props = {
  commandPaths: string[]
  ctx: TenantContext
  navItems: DashboardNavItem[]
  user: SessionUser
}

export function DashboardHeader({ commandPaths, ctx, navItems, user }: Props) {
  return (
    <header
      className="md:m-0 z-50 gap-2 px-4 md:gap-4 md:px-6 md:border-b h-[70px] flex justify-between items-center top-0 backdrop-filter backdrop-blur-xl md:backdrop-filter md:backdrop-blur-none bg-background/70 transition-transform"
      style={{
        transform: "translateY(calc(var(--header-offset, 0px) * -1))",
        transitionDuration: "var(--header-transition, 200ms)",
        willChange: "transform",
      }}
    >
      <MobileMenu navItems={navItems} user={user} ctx={ctx} />
      <DashboardCommandSearch commandPaths={commandPaths} navItems={navItems} />
      <div className="ml-auto flex shrink-0 items-center gap-4 pl-4">
        {ctx.stores.length > 1 ? (
          <div className="hidden max-w-64 md:block">
            <WorkspaceDropdown ctx={ctx} selection="store" isExpanded />
          </div>
        ) : null}
        <UserMenu
          placement="header"
          roleLabel={getDashboardRoleLabel(ctx.membership.role)}
          settingsHref={
            navItems.find((item) => item.href === "/settings")?.href
          }
          user={user}
        />
      </div>
    </header>
  )
}
