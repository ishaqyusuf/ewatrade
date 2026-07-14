import {
  type EwaTradeRole,
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  getRoleDisplayName,
  normalizeRole,
} from "@ewatrade/auth/roles"

export type DashboardNavIcon =
  | "analytics"
  | "customers"
  | "home"
  | "inventory"
  | "links"
  | "products"
  | "sales"
  | "settings"
  | "staff"

export type DashboardNavItem = {
  description: string
  end?: boolean
  href: string
  icon: DashboardNavIcon
  label: string
}

type DashboardNavDefinition = DashboardNavItem & {
  canSee: (role: EwaTradeRole | null) => boolean
}

const canUseDashboard = (role: EwaTradeRole | null) => role !== null

const canManageCatalog = (role: EwaTradeRole | null) =>
  role ? canManageSalesOperations(role) : false

const canUseRetailOps = (role: EwaTradeRole | null) =>
  role ? canOperatePos(role) : false

const DASHBOARD_NAV: DashboardNavDefinition[] = [
  {
    description: "Daily business overview",
    end: true,
    href: "/",
    icon: "home",
    label: "Overview",
    canSee: canUseDashboard,
  },
  {
    description: "Catalog and product setup",
    href: "/products",
    icon: "products",
    label: "Products",
    canSee: canManageCatalog,
  },
  {
    description: "Stock, inbounds, and movement controls",
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
    canSee: canUseRetailOps,
  },
  {
    description: "Sales sessions and order operations",
    href: "/sales",
    icon: "sales",
    label: "Sales",
    canSee: canUseRetailOps,
  },
  {
    description: "Customer book and follow-up records",
    href: "/customers",
    icon: "customers",
    label: "Customers",
    canSee: canUseRetailOps,
  },
  {
    description: "Staff invitations and role administration",
    href: "/staff",
    icon: "staff",
    label: "Staff",
    canSee: canManageCatalog,
  },
  {
    description: "Generated product links and follow-up",
    href: "/links",
    icon: "links",
    label: "Generated links",
    canSee: canUseRetailOps,
  },
  {
    description: "Analytics, reports, exports, and sync review",
    href: "/analytics",
    icon: "analytics",
    label: "Reports",
    canSee: canManageCatalog,
  },
  {
    description: "Business settings, subscription, and billing",
    href: "/settings",
    icon: "settings",
    label: "Settings",
    canSee: (role) => (role ? canManageTenant(role) : false),
  },
]

function getNormalizedRole(role: string | null | undefined) {
  return normalizeRole(role)
}

function matchesPath(pathname: string, href: string, end?: boolean) {
  if (end) {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function getDashboardNavigation(role: string | null | undefined) {
  const normalizedRole = getNormalizedRole(role)

  return DASHBOARD_NAV.filter((item) => item.canSee(normalizedRole)).map(
    ({ canSee: _canSee, ...item }) => item,
  )
}

export function getDashboardNavItem(
  pathname: string,
  role: string | null | undefined,
) {
  return getDashboardNavigation(role).find((item) =>
    matchesPath(pathname, item.href, item.end),
  )
}

export function canAccessDashboardPath(
  pathname: string,
  role: string | null | undefined,
) {
  const normalizedRole = getNormalizedRole(role)
  const matchedKnownPath = DASHBOARD_NAV.find((item) =>
    matchesPath(pathname, item.href, item.end),
  )

  if (!matchedKnownPath) {
    return true
  }

  return matchedKnownPath.canSee(normalizedRole)
}

export function getDashboardRoleLabel(role: string | null | undefined) {
  return getRoleDisplayName(getNormalizedRole(role))
}
