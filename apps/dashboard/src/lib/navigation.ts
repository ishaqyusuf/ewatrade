import {
  type EwaTradeRole,
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  getRoleDisplayName,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"

export type DashboardNavIcon =
  | "analytics"
  | "customers"
  | "home"
  | "inventory"
  | "products"
  | "sales"
  | "services"
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
  canAccess: (
    role: EwaTradeRole | null,
    context: DashboardNavContext,
  ) => boolean
  canSee: (role: EwaTradeRole | null, context: DashboardNavContext) => boolean
}

export type DashboardNavContext = Omit<
  WorkspaceFeatureAvailability,
  "hasInventoryActivity" | "storeId"
>

const DEFAULT_NAV_CONTEXT: DashboardNavContext = {
  hasActiveSellableItems: true,
  hasCatalogItems: true,
  hasCustomers: true,
  hasOrders: true,
  hasProductItems: true,
  hasReportableActivity: true,
  hasServiceItems: true,
  hasServiceJobs: true,
  hasStaff: true,
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
    canAccess: canUseDashboard,
    canSee: canUseDashboard,
  },
  {
    description: "Product and service item setup",
    href: "/catalog",
    icon: "products",
    label: "Catalog",
    canAccess: canManageCatalog,
    canSee: (role, context) =>
      canManageCatalog(role) && context.hasCatalogItems,
  },
  {
    description: "Stock, inbounds, and movement controls",
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
    canAccess: canUseRetailOps,
    canSee: (role, context) => canUseRetailOps(role) && context.hasProductItems,
  },
  {
    description: "Sales sessions and order operations",
    href: "/sales",
    icon: "sales",
    label: "Sales",
    canAccess: canUseRetailOps,
    canSee: (role, context) => canUseRetailOps(role) && context.hasOrders,
  },
  {
    description: "Tracked service work, requests, and due dates",
    href: "/services",
    icon: "services",
    label: "Service jobs",
    canAccess: canUseRetailOps,
    canSee: (role, context) => canUseRetailOps(role) && context.hasServiceJobs,
  },
  {
    description: "Customer book and follow-up records",
    href: "/customers",
    icon: "customers",
    label: "Customers",
    canAccess: canUseRetailOps,
    canSee: (role, context) => canUseRetailOps(role) && context.hasCustomers,
  },
  {
    description: "Staff invitations and role administration",
    href: "/staff",
    icon: "staff",
    label: "Staff",
    canAccess: canManageCatalog,
    canSee: (role, context) => canManageCatalog(role) && context.hasStaff,
  },
  {
    description: "Analytics, reports, exports, and sync review",
    href: "/analytics",
    icon: "analytics",
    label: "Reports",
    canAccess: canManageCatalog,
    canSee: (role, context) =>
      canManageCatalog(role) && context.hasReportableActivity,
  },
  {
    description: "Business settings, subscription, and billing",
    href: "/settings",
    icon: "settings",
    label: "Settings",
    canAccess: (role) => (role ? canManageTenant(role) : false),
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

export function getDashboardNavigation(
  role: string | null | undefined,
  context: DashboardNavContext = DEFAULT_NAV_CONTEXT,
) {
  const normalizedRole = getNormalizedRole(role)

  return DASHBOARD_NAV.filter((item) =>
    item.canSee(normalizedRole, context),
  ).map(({ canAccess: _canAccess, canSee: _canSee, ...item }) => item)
}

export function getDashboardNavItem(
  pathname: string,
  role: string | null | undefined,
  context: DashboardNavContext = DEFAULT_NAV_CONTEXT,
) {
  return getDashboardNavigation(role, context).find((item) =>
    matchesPath(pathname, item.href, item.end),
  )
}

export function canAccessDashboardPath(
  pathname: string,
  role: string | null | undefined,
  context: DashboardNavContext = DEFAULT_NAV_CONTEXT,
) {
  const normalizedRole = getNormalizedRole(role)
  const matchedKnownPath = DASHBOARD_NAV.find((item) =>
    matchesPath(pathname, item.href, item.end),
  )

  if (!matchedKnownPath) {
    return true
  }

  return matchedKnownPath.canAccess(normalizedRole, context)
}

export function getDashboardRoleLabel(role: string | null | undefined) {
  return getRoleDisplayName(getNormalizedRole(role))
}
