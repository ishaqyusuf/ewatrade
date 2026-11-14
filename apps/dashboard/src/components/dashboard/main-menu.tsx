"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IntentLink } from "./intent-link"
import { NavIcon } from "./nav-icon"

type Props = {
  navItems: DashboardNavItem[]
  isExpanded: boolean
  onNavigate?: () => void
}

function matchesPath(pathname: string, item: DashboardNavItem) {
  return (
    pathname === item.href ||
    (!item.end && pathname.startsWith(`${item.href}/`))
  )
}

/**
 * Sidebar rows: 44px, icon in the rail column, label shown while open. An
 * area's pages (Inventory, Finance, Reports) show only for the active area
 * while the sidebar is open.
 */
export function MainMenu({ navItems, isExpanded, onNavigate }: Props) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main navigation"
      className="scrollbar-hide min-h-0 flex-1 overflow-y-auto py-2.5"
    >
      <ul className="grid gap-0.5">
        {navItems.map((item) => {
          const activeChild = item.children
            ?.filter((child) => matchesPath(pathname, child))
            .sort((a, b) => b.href.length - a.href.length)[0]
          const isActive = matchesPath(pathname, item) || Boolean(activeChild)
          const hasChildren = Boolean(item.children?.length)
          const showChildren = isExpanded && hasChildren && isActive
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                title={isExpanded ? undefined : item.label}
                aria-label={item.label}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "relative mx-3 flex h-11 items-center overflow-hidden rounded-[10px] whitespace-nowrap outline-none transition-colors",
                  isActive
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-accent-foreground"
                    : "font-medium text-sidebar-foreground hover:bg-[var(--hover)] hover:text-foreground",
                )}
              >
                <span className="flex w-[calc(var(--rail-width)-24px)] shrink-0 items-center justify-center">
                  <NavIcon name={item.icon} className="size-5" />
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "min-w-0 flex-1 truncate text-base transition-opacity duration-150",
                    isExpanded ? "opacity-100" : "opacity-0",
                  )}
                >
                  {item.label}
                </span>
                {hasChildren && isExpanded ? (
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={showChildren ? ArrowDown01Icon : ArrowRight01Icon}
                    className="mr-3 size-4 shrink-0"
                  />
                ) : null}
                <span className="sr-only">{item.description}</span>
              </Link>
              {showChildren ? (
                <ul className="mt-0.5 mr-3 mb-1.5 ml-[calc(var(--rail-width)/2+2px)] grid gap-0.5 border-l border-sidebar-border pl-2.5">
                  {item.children?.map((child) => {
                    const isCurrent = child.href === activeChild?.href
                    return (
                      <li key={child.href}>
                        <IntentLink
                          href={child.href}
                          onClick={onNavigate}
                          aria-current={isCurrent ? "page" : undefined}
                          className={cn(
                            "flex h-11 items-center overflow-hidden rounded-[10px] px-2.5 text-sm whitespace-nowrap outline-none",
                            isCurrent
                              ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                              : "text-sidebar-foreground hover:bg-[var(--hover)] hover:text-foreground",
                          )}
                        >
                          {child.label}
                        </IntentLink>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
