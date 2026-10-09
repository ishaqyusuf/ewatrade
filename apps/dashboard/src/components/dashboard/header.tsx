"use client"

import { DashboardCommandSearch } from "@/components/dashboard/command-search"
import { DashboardLogo } from "@/components/dashboard/dashboard-logo"
import { MobileMenu } from "@/components/dashboard/mobile-menu"
import { getSectionCrumb } from "@/components/dashboard/shell/rail-model"
import { UserMenu } from "@/components/dashboard/user-menu"
import { WorkspaceDropdown } from "@/components/dashboard/workspace-dropdown"
import { type DashboardNavItem, getDashboardRoleLabel } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import { usePathname } from "next/navigation"

type Props = {
  commandPaths: string[]
  ctx: TenantContext
  navItems: DashboardNavItem[]
  user: SessionUser
}

/**
 * Full-width top bar. Desktop: brand, workspace switcher and section
 * breadcrumb | centred ⌘K search | account. Small screens keep the
 * menu + search + account actions.
 */
export function DashboardHeader({ commandPaths, ctx, navItems, user }: Props) {
  const pathname = usePathname()
  const crumb = getSectionCrumb(navItems, pathname)

  return (
    <header
      className="z-40 flex h-14 items-center gap-2 bg-background/70 px-4 backdrop-blur-xl transition-transform md:sticky md:top-0 md:grid md:grid-cols-[minmax(0,1fr)_minmax(200px,320px)_minmax(0,1fr)] md:gap-4 md:border-b md:border-border md:bg-background md:pr-4 md:pl-0 md:backdrop-blur-none lg:grid-cols-[minmax(0,1fr)_minmax(240px,480px)_minmax(0,1fr)]"
      style={{
        transform: "translateY(calc(var(--header-offset, 0px) * -1))",
        transitionDuration: "var(--header-transition, 200ms)",
        willChange: "transform",
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <MobileMenu navItems={navItems} user={user} ctx={ctx} />
        <div className="hidden w-16 shrink-0 place-items-center md:grid">
          <DashboardLogo />
        </div>
        <div className="hidden min-w-0 md:block">
          <WorkspaceDropdown ctx={ctx} variant="topbar" />
        </div>
        {crumb ? (
          <p className="hidden min-w-0 items-center text-sm lg:flex">
            <span
              aria-hidden="true"
              className="px-0.5 text-lg font-light text-muted-foreground/50"
            >
              /
            </span>
            <span className="sr-only">Current section: </span>
            <span className="truncate px-1.5 font-medium text-muted-foreground">
              {crumb}
            </span>
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center">
        <DashboardCommandSearch
          commandPaths={commandPaths}
          navItems={navItems}
        />
      </div>
      <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
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
