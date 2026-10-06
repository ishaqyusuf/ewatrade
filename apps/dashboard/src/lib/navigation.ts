import {
  type EwaTradeRole,
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  getRoleDisplayName,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  type BusinessOperatingModel,
  findBusinessProfile,
} from "@ewatrade/utils"
import { canOperateInventory } from "./inventory-operations"

export type DashboardNavIcon =
  | "analytics"
  | "customers"
  | "conversations"
  | "home"
  | "inventory"
  | "products"
  | "prescriptions"
  | "sales"
  | "services"
  | "settings"
  | "staff"

export type DashboardNavItem = {
  children?: DashboardNavItem[]
  description: string
  end?: boolean
  href: string
  icon: DashboardNavIcon
  label: string
}

type DashboardNavDefinition = Omit<DashboardNavItem, "children"> & {
  canAccess: (
    role: EwaTradeRole | null,
    context: DashboardNavContext,
  ) => boolean
  children?: DashboardNavDefinition[]
  isVisible?: (context: DashboardNavContext) => boolean
}

export type DashboardNavContext = Partial<
  Omit<WorkspaceFeatureAvailability, "hasInventoryActivity" | "storeId">
> & {
  staffAccessMode?: "LEGACY" | "SCOPED"
  catalogEditor?: boolean
  businessProfileKey?: string | null
  isPlatformAdmin?: boolean
  operatingModel?: BusinessOperatingModel | null
}

const canUseDashboard = (role: EwaTradeRole | null) => role !== null

const canManageCatalog = (
  role: EwaTradeRole | null,
  context: DashboardNavContext,
) =>
  role
    ? context.staffAccessMode === "SCOPED" && !canManageTenant(role)
      ? context.catalogEditor === true
      : canManageSalesOperations(role)
    : false

const canUseRetailOps = (role: EwaTradeRole | null) =>
  role ? canOperatePos(role) : false

const canManageTenantRole = (role: EwaTradeRole | null) =>
  role ? canManageTenant(role) : false

function getRecommendedItemKinds(context: DashboardNavContext) {
  const operatingModel = context.operatingModel
  if (
    operatingModel &&
    BUSINESS_OPERATING_MODEL_KEYS.includes(operatingModel)
  ) {
    if (operatingModel === "products") return ["product"]
    if (operatingModel === "services") return ["service"]
    return ["product", "service"]
  }

  return findBusinessProfile(context.businessProfileKey)?.recommendedItemKinds
}

function isProductOrMixedBusiness(context: DashboardNavContext) {
  const recommendedItemKinds = getRecommendedItemKinds(context)
  return (
    recommendedItemKinds === undefined ||
    recommendedItemKinds.includes("product")
  )
}

function isServiceOrMixedBusiness(context: DashboardNavContext) {
  const recommendedItemKinds = getRecommendedItemKinds(context)
  return (
    recommendedItemKinds === undefined ||
    recommendedItemKinds.includes("service")
  )
}

function isPharmacyBusiness(context: DashboardNavContext) {
  return (
    findBusinessProfile(context.businessProfileKey)?.key ===
    "pharmacy-health-retail"
  )
}

const DASHBOARD_NAV: DashboardNavDefinition[] = [
  {
    description: "Daily business overview",
    end: true,
    href: "/",
    icon: "home",
    label: "Overview",
    canAccess: canUseDashboard,
  },
  {
    description: "Customer requests, response SLA, and team handoff",
    href: "/conversations",
    icon: "conversations",
    label: "Conversations",
    canAccess: canUseRetailOps,
  },
  {
    description: "Product and service item setup",
    href: "/catalog",
    icon: "products",
    label: "Catalog",
    canAccess: canManageCatalog,
  },
  {
    description: "Stock, inbounds, and movement controls",
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
    canAccess: (role, context) =>
      canOperateInventory(role, context.staffAccessMode),
    children: [
      {
        href: "/inventory/operations",
        icon: "inventory",
        label: "Operations",
        description: "Stock operation history",
        canAccess: (role, context) =>
          canOperateInventory(role, context.staffAccessMode),
      },
      {
        href: "/inventory/transfers",
        icon: "inventory",
        label: "Stock transfers",
        description: "Incoming and outgoing stock transfers",
        canAccess: (role, context) =>
          canOperateInventory(role, context.staffAccessMode),
      },
    ],
  },
  {
    description: "Sales sessions and order operations",
    href: "/sales",
    icon: "sales",
    label: "Sales",
    canAccess: canUseRetailOps,
    isVisible: isProductOrMixedBusiness,
  },
  {
    description: "Tracked service work, requests, and due dates",
    href: "/services",
    icon: "services",
    label: "Service jobs",
    canAccess: canUseRetailOps,
    isVisible: isServiceOrMixedBusiness,
  },
  {
    description: "Private prescription intake and pharmacy review",
    href: "/prescriptions",
    icon: "prescriptions",
    label: "Prescriptions",
    canAccess: canUseRetailOps,
    isVisible: isPharmacyBusiness,
  },
  {
    description: "Customer book and follow-up records",
    href: "/customers",
    icon: "customers",
    label: "Customers",
    canAccess: canUseRetailOps,
  },
  {
    description: "Staff invitations and role administration",
    href: "/staff",
    icon: "staff",
    label: "Staff",
    canAccess: canManageCatalog,
  },
  {
    description: "Spending, money accounts and financial records",
    href: "/finance",
    icon: "analytics",
    label: "Finance",
    canAccess: canManageTenantRole,
    children: [
      {
        description: "Financial overview",
        href: "/finance",
        icon: "analytics",
        label: "Overview",
        canAccess: canManageTenantRole,
      },
      {
        description: "Review spending records",
        href: "/finance/spending",
        icon: "analytics",
        label: "Spending",
        canAccess: canManageTenantRole,
      },
      {
        description: "Manage money accounts",
        href: "/finance/accounts",
        icon: "analytics",
        label: "Accounts",
        canAccess: canManageTenantRole,
      },
      {
        description: "Manage supplier balances and bills",
        href: "/finance/suppliers",
        icon: "analytics",
        label: "Suppliers",
        canAccess: canManageTenantRole,
      },
      {
        description: "Customer statements and collections",
        href: "/customer-ledger",
        icon: "analytics",
        label: "Customer accounts",
        canAccess: canManageTenantRole,
      },
      {
        description: "Financial reports and exports",
        href: "/finance/reports",
        icon: "analytics",
        label: "Finance reports",
        canAccess: canManageTenantRole,
      },
    ],
  },
  {
    description: "Analytics, reports, exports, and sync review",
    href: "/analytics",
    icon: "analytics",
    label: "Reports",
    canAccess: canManageCatalog,
    children: [
      {
        description: "Analytics, exports, and sync review",
        href: "/analytics",
        icon: "analytics",
        label: "Overview",
        canAccess: canManageCatalog,
      },
      {
        description: "Service Commerce operational reports",
        href: "/service-commerce/reports",
        icon: "analytics",
        label: "Service commerce",
        canAccess: canManageCatalog,
      },
      {
        description: "Prescription operations reports",
        href: "/prescriptions/reports",
        icon: "prescriptions",
        label: "Prescription operations",
        canAccess: canManageTenantRole,
        isVisible: isPharmacyBusiness,
      },
    ],
  },
  {
    description: "Business settings, subscription, and billing",
    href: "/settings",
    icon: "settings",
    label: "Settings",
    canAccess: canManageTenantRole,
    children: [
      {
        description: "General business settings",
        href: "/settings",
        icon: "settings",
        label: "General",
        canAccess: canManageTenantRole,
      },
      {
        description: "Manage business Stores",
        href: "/settings/stores",
        icon: "settings",
        label: "Stores",
        canAccess: canManageTenantRole,
      },
      {
        description: "Order receipt defaults and Store overrides",
        href: "/settings/receipts",
        icon: "settings",
        label: "Receipts",
        canAccess: canManageTenantRole,
      },
      {
        description: "Business domain settings",
        href: "/settings/domains",
        icon: "settings",
        label: "Domains",
        canAccess: canManageTenantRole,
      },
      {
        description: "Customer communication channels",
        href: "/settings/channels",
        icon: "settings",
        label: "Channels",
        canAccess: canManageTenantRole,
      },
      {
        description: "Service Commerce setup",
        href: "/settings/service-commerce",
        icon: "settings",
        label: "Service Commerce",
        canAccess: canManageTenantRole,
      },
      {
        description: "Pharmacy compliance settings",
        href: "/settings/compliance",
        icon: "settings",
        label: "Compliance",
        canAccess: canManageTenantRole,
        isVisible: isPharmacyBusiness,
      },
      {
        description: "Business and subscription billing",
        href: "/settings/billing",
        icon: "settings",
        label: "Billing",
        canAccess: canManageTenantRole,
      },
    ],
  },
  {
    description: "Platform quality assurance tools",
    href: "/platform/qa-maintenance",
    icon: "settings",
    label: "QA maintenance",
    canAccess: (_role, context) => context.isPlatformAdmin === true,
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

function flattenDefinitions(
  items: DashboardNavDefinition[],
): DashboardNavDefinition[] {
  return items.flatMap((item) => [
    item,
    ...flattenDefinitions(item.children ?? []),
  ])
}

function flattenNavItems(items: DashboardNavItem[]): DashboardNavItem[] {
  return items.flatMap((item) => [
    item,
    ...flattenNavItems(item.children ?? []),
  ])
}

function scopedPageAllowed(
  href: string,
  role: EwaTradeRole | null,
  context: DashboardNavContext,
) {
  if (context.staffAccessMode !== "SCOPED" || (role && canManageTenant(role)))
    return true
  return [
    "/",
    "/sales",
    "/customers",
    "/inventory",
    "/inventory/operations",
    "/inventory/transfers",
    "/catalog",
  ].includes(href)
}

function filterAndStripDefinitions(
  items: DashboardNavDefinition[],
  role: EwaTradeRole | null,
  context: DashboardNavContext,
): DashboardNavItem[] {
  return items.flatMap((item) => {
    if (
      !scopedPageAllowed(item.href, role, context) ||
      !item.canAccess(role, context) ||
      (item.isVisible && !item.isVisible(context))
    ) {
      return []
    }

    const {
      canAccess: _canAccess,
      children,
      isVisible: _isVisible,
      ...visibleItem
    } = item
    const visibleChildren = filterAndStripDefinitions(
      children ?? [],
      role,
      context,
    )

    return [
      {
        ...visibleItem,
        ...(visibleChildren.length ? { children: visibleChildren } : {}),
      },
    ]
  })
}

export function getDashboardNavigation(
  role: string | null | undefined,
  context: DashboardNavContext = {},
) {
  return filterAndStripDefinitions(
    DASHBOARD_NAV,
    getNormalizedRole(role),
    context,
  )
}

export function getDashboardNavItem(
  pathname: string,
  role: string | null | undefined,
  context: DashboardNavContext = {},
) {
  return flattenNavItems(getDashboardNavigation(role, context))
    .filter((item) => matchesPath(pathname, item.href, item.end))
    .sort((left, right) => right.href.length - left.href.length)[0]
}

export function canAccessDashboardPath(
  pathname: string,
  role: string | null | undefined,
  context: DashboardNavContext = {},
) {
  const normalizedRole = getNormalizedRole(role)
  if (!scopedPageAllowed(pathname, normalizedRole, context)) return false
  const matchedKnownPath = flattenDefinitions(DASHBOARD_NAV)
    .filter((item) => matchesPath(pathname, item.href, item.end))
    .sort((left, right) => right.href.length - left.href.length)[0]

  if (!matchedKnownPath) {
    return true
  }

  return matchedKnownPath.canAccess(normalizedRole, context)
}

export function getDashboardRoleLabel(role: string | null | undefined) {
  return getRoleDisplayName(getNormalizedRole(role))
}
