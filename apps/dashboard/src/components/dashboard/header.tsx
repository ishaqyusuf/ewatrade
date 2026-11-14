"use client"

import { DashboardCommandSearch } from "@/components/dashboard/command-search"
import { MobileMenu } from "@/components/dashboard/mobile-menu"
import { UserMenu } from "@/components/dashboard/user-menu"
import { WorkspaceDropdown } from "@/components/dashboard/workspace-dropdown"
import { BusinessNotificationCenter } from "@/components/notification-center/business-notification-center"
import {
  type DashboardNavItem,
  getDashboardPageTitle,
  getDashboardRoleLabel,
} from "@/lib/navigation"
import { canUseSalesOperations } from "@/lib/sales-operations"
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
 * Top bar (64px, 60px on phones): the page's only `<h1>`, search (⌘K), the
 * store picker when there is more than one store, notifications and the
 * account menu. Page headers below it do not repeat the title.
 */
export function DashboardHeader({ commandPaths, ctx, navItems, user }: Props) {
  const pathname = usePathname()
  const title = getDashboardPageTitle(pathname, navItems)
  const roleLabel = getDashboardRoleLabel(ctx.membership.role)
  const settingsHref = navItems.find((item) => item.href === "/settings")?.href

  return (
    <header
      className="sticky top-0 z-40 flex h-[var(--header-height)] items-center gap-1 border-b border-border bg-card px-2 transition-transform sm:px-4 md:gap-3 md:px-6"
      style={{
        transform: "translateY(calc(var(--header-offset, 0px) * -1))",
        transitionDuration: "var(--header-transition, 200ms)",
        willChange: "transform",
      }}
    >
      <MobileMenu
        navItems={navItems}
        user={user}
        ctx={ctx}
        roleLabel={roleLabel}
        settingsHref={settingsHref}
      />
      <h1 className="min-w-0 truncate text-xl leading-tight md:text-[1.375rem]">
        {title}
      </h1>
      <DashboardCommandSearch commandPaths={commandPaths} navItems={navItems} />
      <div className="flex shrink-0 items-center gap-1 md:ml-auto md:gap-1.5">
        {ctx.stores.length > 1 ? (
          <div className="mr-1.5 hidden lg:block">
            <WorkspaceDropdown ctx={ctx} selection="store" isExpanded />
          </div>
        ) : null}
        {canUseSalesOperations(ctx.membership.role) ? (
          // Keyed so no count or alert from an earlier user, Business or
          // Store can render after a switch.
          <BusinessNotificationCenter
            key={JSON.stringify([
              user.id,
              ctx.tenant.id,
              ctx.activeStore?.id ?? null,
            ])}
            timeZone={ctx.tenant.timezone}
            viewerMembershipId={ctx.membership.id}
          />
        ) : null}
        <UserMenu
          placement="header"
          roleLabel={roleLabel}
          settingsHref={settingsHref}
          user={user}
        />
      </div>
    </header>
  )
}
