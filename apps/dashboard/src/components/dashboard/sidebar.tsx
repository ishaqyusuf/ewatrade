"use client"

import { type DashboardNavItem, getDashboardRoleLabel } from "@/lib/navigation"
import type { SessionUser } from "@/lib/session"
import type { TenantContext } from "@/lib/tenant"
import { cn } from "@/utils"
import { useEffect, useRef, useState } from "react"
import { DashboardLogo } from "./dashboard-logo"
import { MainMenu } from "./main-menu"
import { UserMenu } from "./user-menu"
import { WorkspaceDropdown } from "./workspace-dropdown"

const HOVER_DELAY_MS = 500

type Props = {
  navItems: DashboardNavItem[]
  user: SessionUser
  ctx: TenantContext
}

export function DashboardSidebar({ navItems, user, ctx }: Props) {
  const [isPointerInside, setIsPointerInside] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isExpanded = isPointerInside || isFocusWithin
  const settingsHref = navItems.find((item) => item.href === "/settings")?.href

  useEffect(() => () => clearHoverTimer(), [])

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  function setPointerInsideAfterDelay(inside: boolean) {
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      setIsPointerInside(inside)
    }, HOVER_DELAY_MS)
  }

  return (
    <aside
      aria-label="Dashboard sidebar"
      className={cn(
        "group/sidebar fixed left-0 top-0 z-50 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar pb-4 transition-[width] duration-200 ease-out md:flex",
        isExpanded ? "w-[240px]" : "w-[70px]",
      )}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setIsFocusWithin(false)
        }
      }}
      onFocusCapture={() => setIsFocusWithin(true)}
      onMouseEnter={() => setPointerInsideAfterDelay(true)}
      onMouseLeave={() => setPointerInsideAfterDelay(false)}
    >
      <div className="flex h-[70px] shrink-0 items-center border-b border-sidebar-border px-[22px]">
        <DashboardLogo />
      </div>

      <div className="shrink-0 border-b border-sidebar-border px-2 py-3">
        <WorkspaceDropdown
          ctx={ctx}
          isExpanded={isExpanded}
          selection="business"
        />
      </div>

      <MainMenu isExpanded={isExpanded} navItems={navItems} />

      <div className="shrink-0 border-t border-sidebar-border px-2 pt-3">
        <UserMenu
          isExpanded={isExpanded}
          roleLabel={getDashboardRoleLabel(ctx.membership.role)}
          settingsHref={settingsHref}
          user={user}
        />
      </div>
    </aside>
  )
}
