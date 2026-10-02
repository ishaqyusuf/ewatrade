"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState } from "react"
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
      className="min-h-0 flex-1 overflow-y-auto py-4"
    >
      <ul className="flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive =
            matchesPath(pathname, item) ||
            Boolean(
              item.children?.some((child) => matchesPath(pathname, child)),
            )
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
                    "group/nav-item relative mx-[15px] flex h-10 items-center overflow-hidden border border-transparent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-[#e6e6e6] bg-[#f7f7f7] text-foreground dark:border-[#1d1d1d] dark:bg-[#131313] dark:text-foreground"
                      : "text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center">
                    <NavIcon
                      name={item.icon}
                      className={cn(
                        "size-5 transition-colors",
                        isActive
                          ? "text-foreground dark:text-white"
                          : "text-foreground dark:text-[#666666]",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm font-medium transition-[opacity,width] duration-150",
                      hasChildren ? "pr-10" : "pr-2",
                      isActive
                        ? "text-primary"
                        : "text-[#666666] group-hover/nav-item:text-primary",
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
                    className="absolute right-5 top-1 flex size-8 items-center justify-center text-[#888] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
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
                  className="mt-1 ml-[35px] mr-[15px] border-l border-[#e6e6e6] dark:border-[#1d1d1d]"
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
                          "flex h-8 items-center overflow-hidden whitespace-nowrap pl-3 text-xs font-medium text-[#888] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring",
                          pathname === child.href && "text-primary",
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
