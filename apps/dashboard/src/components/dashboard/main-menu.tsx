"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { NavIcon } from "./nav-icon"
import { isNavItemActive } from "./shell/rail-model"

type Props = {
  navItems: DashboardNavItem[]
  isExpanded: boolean
  onNavigate?: () => void
}

/** Vertical nav list used by the small-screen navigation sheet. */
export function MainMenu({ navItems, isExpanded, onNavigate }: Props) {
  const pathname = usePathname()
  const id = useId()
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  useEffect(() => {
    if (!isExpanded) setExpandedItem(null)
  }, [isExpanded])

  return (
    <nav
      aria-label="Main navigation"
      className="min-h-0 flex-1 overflow-y-auto py-3"
    >
      <ul className="flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = isNavItemActive(pathname, item)
          const hasChildren = Boolean(item.children?.length)
          const showChildren = isExpanded && expandedItem === item.href
          const childrenId = `${id}-${item.href.replaceAll("/", "-")}`
          return (
            <li key={item.href}>
              <div className="relative">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={isExpanded ? undefined : item.label}
                  aria-label={item.label}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "group/nav-item relative mx-3 flex h-10 items-center overflow-hidden rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center">
                    <NavIcon
                      name={item.icon}
                      className={cn(
                        "size-5 transition-colors",
                        isActive && "text-primary",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm transition-[opacity,width] duration-150",
                      hasChildren ? "pr-10" : "pr-2",
                      isActive ? "font-semibold" : "font-medium",
                      isExpanded ? "w-auto opacity-100" : "w-0 opacity-0",
                    )}
                    aria-hidden={!isExpanded}
                  >
                    {item.label}
                  </span>
                  <span className="sr-only">{item.description}</span>
                </Link>
                {isExpanded && hasChildren ? (
                  <button
                    type="button"
                    aria-label={`Toggle ${item.label} pages`}
                    aria-expanded={showChildren}
                    aria-controls={showChildren ? childrenId : undefined}
                    onClick={() =>
                      setExpandedItem(showChildren ? null : item.href)
                    }
                    className="absolute top-1 right-4 flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className={cn(
                        "size-4 transition-transform",
                        showChildren && "rotate-180",
                      )}
                    />
                  </button>
                ) : null}
              </div>
              {showChildren ? (
                <ul
                  id={childrenId}
                  className="mt-1 mr-3 ml-[31px] border-l border-border"
                >
                  {item.children?.map((child) => (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        prefetch
                        onClick={onNavigate}
                        aria-current={
                          pathname === child.href ? "page" : undefined
                        }
                        className={cn(
                          "flex h-8 items-center overflow-hidden whitespace-nowrap pl-3 text-xs font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                          pathname === child.href
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
