import type { DashboardNavItem } from "@/lib/navigation"

/** Cookie that remembers the rail's labels mode, read by the shell layout. */
export const RAIL_LABELS_COOKIE = "ewatrade.dashboard_rail_labels"

export const RAIL_WIDTH = { icons: 64, labels: 88 } as const

type RailGroup = "top" | "sell" | "stock" | "money" | "team" | "foot"

// Visual grouping only; access and order still come from getDashboardNavigation.
const RAIL_GROUP_BY_HREF: Record<string, RailGroup> = {
  "/assistant": "top",
  "/": "top",
  "/conversations": "top",
  "/sales": "sell",
  "/services": "sell",
  "/prescriptions": "sell",
  "/customers": "sell",
  "/catalog": "stock",
  "/inventory": "stock",
  "/finance": "money",
  "/analytics": "money",
  "/staff": "team",
  "/settings": "foot",
  "/platform/qa-maintenance": "foot",
}

const RAIL_GROUP_ORDER: RailGroup[] = ["top", "sell", "stock", "money", "team"]

export function matchesNavPath(pathname: string, item: DashboardNavItem) {
  return (
    pathname === item.href ||
    (!item.end && pathname.startsWith(`${item.href}/`))
  )
}

export function isNavItemActive(pathname: string, item: DashboardNavItem) {
  return (
    matchesNavPath(pathname, item) ||
    Boolean(item.children?.some((child) => matchesNavPath(pathname, child)))
  )
}

/** The links a rail flyout lists: the section page first when no child already points at it. */
export function getFlyoutLinks(item: DashboardNavItem): DashboardNavItem[] {
  const children = item.children ?? []
  if (children.some((child) => child.href === item.href)) return children
  return [{ ...item, children: undefined, label: "Overview" }, ...children]
}

/** The most specific flyout link for the current page, e.g. /finance/spending over /finance. */
export function getActiveFlyoutHref(pathname: string, item: DashboardNavItem) {
  return getFlyoutLinks(item)
    .filter((link) => matchesNavPath(pathname, link))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href
}

export function groupRailItems(navItems: DashboardNavItem[]) {
  const groups = new Map<RailGroup | "other", DashboardNavItem[]>()
  for (const item of navItems) {
    const group = RAIL_GROUP_BY_HREF[item.href] ?? "other"
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  const main = [...RAIL_GROUP_ORDER, "other" as const]
    .map((group) => groups.get(group) ?? [])
    .filter((items) => items.length > 0)

  return { main, footer: groups.get("foot") ?? [] }
}

/** Top-bar breadcrumb for the current section, e.g. "Finance · Spending". */
export function getSectionCrumb(
  navItems: DashboardNavItem[],
  pathname: string,
) {
  const section = navItems.find((item) => isNavItemActive(pathname, item))
  if (!section) return null
  if (!section.children?.length) return section.label

  const childHref = getActiveFlyoutHref(pathname, section)
  const child = section.children.find((item) => item.href === childHref)
  return child && child.href !== section.href
    ? `${section.label} · ${child.label}`
    : section.label
}

export function getWorkspaceInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials =
    words.length >= 2
      ? `${words[0]?.charAt(0) ?? ""}${words[1]?.charAt(0) ?? ""}`
      : (words[0]?.slice(0, 2) ?? "")
  return initials.toUpperCase() || "?"
}
