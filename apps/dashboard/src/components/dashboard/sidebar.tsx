"use client"

import { type DashboardNavItem, getSidebarNavItems } from "@/lib/navigation"
import type { TenantContext } from "@/lib/tenant"
import { cn } from "@/utils"
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { MainMenu } from "./main-menu"
import { useSidebarState } from "./sidebar-state"
import { WorkspaceDropdown } from "./workspace-dropdown"

type Props = {
  navItems: DashboardNavItem[]
  ctx: TenantContext
}

/**
 * 70px rail that opens to 256px after 500ms of hover (at once on keyboard
 * focus) and closes 500ms after leaving. From 1024px, Keep open pins it and
 * the content shifts by the same `--sidebar-width`.
 */
export function DashboardSidebar({ navItems, ctx }: Props) {
  const sidebar = useSidebarState()
  const pinned = sidebar.isPinned && sidebar.canPin
  const label = pinned ? "Let sidebar close" : "Keep sidebar open"

  return (
    <aside
      aria-label="Sidebar"
      data-open={sidebar.isOpen ? "true" : undefined}
      data-pinned={pinned ? "true" : undefined}
      className="dashboard-sidebar group/sidebar fixed top-0 left-0 z-50 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          sidebar.focusLeave()
      }}
      onFocus={(event) => {
        // Pointer clicks also focus; only keyboard focus opens at once.
        if (
          event.target instanceof HTMLElement &&
          event.target.matches(":focus-visible")
        )
          sidebar.focusEnter()
      }}
      onMouseEnter={sidebar.pointerEnter}
      onMouseLeave={sidebar.pointerLeave}
    >
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <div className="min-w-0 flex-1">
          <WorkspaceDropdown
            ctx={ctx}
            isExpanded={sidebar.isOpen}
            selection="business"
          />
        </div>
        {sidebar.isOpen && sidebar.canPin ? (
          <button
            type="button"
            aria-label={label}
            aria-pressed={pinned}
            aria-keyshortcuts="["
            onClick={sidebar.togglePinned}
            className={cn(
              "group/pin relative hidden size-10 shrink-0 items-center justify-center rounded-[10px] outline-none lg:flex",
              pinned
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-[var(--hover)] hover:text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={pinned ? PinOffIcon : PinIcon}
              className="size-5"
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 z-[60] hidden -translate-x-1/2 items-center gap-2 rounded-lg bg-foreground px-2.5 py-2 text-xs font-medium whitespace-nowrap text-background shadow-lg group-hover/pin:flex group-focus-visible/pin:flex"
            >
              {label}
              <kbd className="rounded bg-background/20 px-1.5 py-0.5 font-sans text-xs font-semibold">
                [
              </kbd>
            </span>
          </button>
        ) : null}
      </div>

      <MainMenu
        isExpanded={sidebar.isOpen}
        navItems={getSidebarNavItems(navItems)}
      />
    </aside>
  )
}
