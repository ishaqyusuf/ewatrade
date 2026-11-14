"use client"

import { type DashboardNavItem, getSidebarNavItems } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import { Button } from "@ewatrade/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@ewatrade/ui/sheet"
import {
  Cancel01Icon,
  Menu01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { MainMenu } from "./main-menu"
import { OPEN_DASHBOARD_SEARCH_EVENT } from "./open-search-button"
import { UserMenu } from "./user-menu"
import { WorkspaceDropdown } from "./workspace-dropdown"

type Props = {
  navItems: DashboardNavItem[]
  user: SessionUser
  ctx: TenantContext
  roleLabel: string
  settingsHref?: string
}

/** Under 768px: business switcher, search, the sidebar rows and the account row. */
export function MobileMenu({
  navItems,
  ctx,
  user,
  roleLabel,
  settingsHref,
}: Props) {
  const [openPathname, setOpenPathname] = useState<string | null>(null)
  const pathname = usePathname()
  const open = openPathname === pathname
  const close = () => setOpenPathname(null)

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => setOpenPathname(nextOpen ? pathname : null)}
    >
      <SheetTrigger
        render={
          <Button
            aria-label="Open menu"
            className="size-11 shrink-0 md:hidden"
            size="icon"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={Menu01Icon} className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        title="Menu"
        className="flex flex-col gap-0 overflow-hidden border-0 bg-sidebar p-0 text-sidebar-foreground"
      >
        <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
          <div className="min-w-0 flex-1">
            <WorkspaceDropdown
              ctx={ctx}
              isExpanded
              selection="business"
              onNavigate={close}
            />
          </div>
          <SheetClose
            render={
              <Button
                aria-label="Close menu"
                className="size-11"
                size="icon"
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </SheetClose>
        </div>
        <div className="shrink-0 px-3 pt-3">
          <button
            type="button"
            onClick={() => {
              close()
              window.dispatchEvent(new Event(OPEN_DASHBOARD_SEARCH_EVENT))
            }}
            className="flex h-11 w-full items-center gap-2.5 rounded-[10px] border border-[color:var(--input)] bg-background px-3 text-left text-base text-muted-foreground"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-[18px]" />
            Search
          </button>
        </div>
        <MainMenu
          isExpanded
          navItems={getSidebarNavItems(navItems)}
          onNavigate={close}
        />
        <div className="shrink-0 border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <UserMenu
            placement="sheet"
            roleLabel={roleLabel}
            settingsHref={settingsHref}
            user={user}
            onNavigate={close}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
