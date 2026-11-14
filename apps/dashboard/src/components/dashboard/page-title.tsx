"use client"

import { type DashboardNavItem, getDashboardPageTitle } from "@/lib/navigation"
import { cn } from "@/utils"
import { usePathname } from "next/navigation"
import { type ReactNode, createContext, useContext } from "react"

const NavItemsContext = createContext<DashboardNavItem[] | null>(null)

/** Lets pages inside the shell know the top bar's title. */
export function DashboardPageTitleProvider({
  navItems,
  children,
}: {
  navItems: DashboardNavItem[]
  children: ReactNode
}) {
  return (
    <NavItemsContext.Provider value={navItems}>
      {children}
    </NavItemsContext.Provider>
  )
}

/** The top bar's `<h1>` text, or null outside the dashboard shell. */
export function useDashboardPageTitle() {
  const pathname = usePathname()
  const navItems = useContext(NavItemsContext)
  return navItems ? getDashboardPageTitle(pathname, navItems) : null
}

/**
 * True on a sidebar row's own page (Sales, Stock history), where the top bar
 * already names the page. Settings sections keep their own heading.
 */
function useIsSectionRoot() {
  const pathname = usePathname()
  const navItems = useContext(NavItemsContext)
  if (!navItems || pathname.startsWith("/settings")) return false
  return navItems.some(
    (item) =>
      item.href === pathname ||
      item.children?.some((child) => child.href === pathname),
  )
}

/**
 * A page heading under the top bar. Inside the shell the top bar owns the
 * page's only `<h1>`, so this renders nothing when it would repeat that title
 * and an `<h2>` otherwise (a record name, a Settings section). Outside the
 * shell (sign-in, account pages) it stays the page's `<h1>`.
 */
export function PageTitleHeading({
  title,
  className,
  eyebrow,
}: {
  title: ReactNode
  className?: string
  /** Shown above the title only while the title shows. */
  eyebrow?: ReactNode
}) {
  const routeTitle = useDashboardPageTitle()
  const sectionRoot = useIsSectionRoot()
  if (routeTitle !== null && (title === routeTitle || sectionRoot)) return null
  const Heading = routeTitle === null ? "h1" : "h2"
  return (
    <>
      {eyebrow}
      <Heading className={cn("text-2xl tracking-tight", className)}>
        {title}
      </Heading>
    </>
  )
}
