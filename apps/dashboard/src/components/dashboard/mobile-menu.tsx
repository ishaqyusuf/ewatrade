"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { getDashboardRoleLabel } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@ewatrade/ui"
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { DashboardLogo } from "./dashboard-logo"
import { MainMenu } from "./main-menu"
import { UserMenu } from "./user-menu"
import { WorkspaceDropdown } from "./workspace-dropdown"

type Props = {
  navItems: DashboardNavItem[]
  user: SessionUser
  ctx: TenantContext
}

export function MobileMenu({ navItems, ctx, user }: Props) {
  const [openPathname, setOpenPathname] = useState<string | null>(null)
  const pathname = usePathname()
  const open = openPathname === pathname

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => setOpenPathname(nextOpen ? pathname : null)}
    >
      <SheetTrigger
        render={
          <Button
            aria-label="Open dashboard navigation"
            className="size-11 md:hidden"
            size="icon"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={Menu01Icon} className="size-[18px]" />
      </SheetTrigger>
      <SheetContent
        side="left"
        title="Dashboard navigation"
        className="flex flex-col gap-0 overflow-hidden border-0 bg-sidebar p-0"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border pr-3 pl-5">
          <DashboardLogo />
          <SheetClose
            render={
              <Button
                aria-label="Close dashboard navigation"
                className="ml-auto"
                size="icon"
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </SheetClose>
        </div>
        <div className="shrink-0 border-b border-sidebar-border px-3 py-3">
          <WorkspaceDropdown
            ctx={ctx}
            isExpanded
            onNavigate={() => setOpenPathname(null)}
          />
        </div>
        <MainMenu
          isExpanded
          navItems={navItems}
          onNavigate={() => setOpenPathname(null)}
        />
        <div className="shrink-0 border-t border-sidebar-border px-3 pt-3">
          <UserMenu
            isExpanded
            roleLabel={getDashboardRoleLabel(ctx.membership.role)}
            settingsHref={
              navItems.find((item) => item.href === "/settings")?.href
            }
            user={user}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
