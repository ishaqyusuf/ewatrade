import {
  type EwaTradeRole,
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  getRoleDisplayName,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"
import type { RetailOpsPlanFeature } from "@ewatrade/db/subscription-plans"
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  type BusinessOperatingModel,
  findBusinessProfile,
} from "@ewatrade/utils"
import { canOperateInventory } from "./inventory-operations"

export type DashboardNavIcon =
  | "activity"
  | "assistant"
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
  /** Settings side list section. */
  group?: "Business" | "Selling" | "Customers" | "Team" | "Pharmacy"
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
  /** Hidden, and its pages redirect, when the tenant's plan lacks it. */
  requiresPlanFeature?: RetailOpsPlanFeature
}

export type DashboardNavContext = Partial<
  Omit<WorkspaceFeatureAvailability, "hasInventoryActivity" | "storeId">
> & {
  staffAccessMode?: "LEGACY" | "SCOPED"
  catalogEditor?: boolean
  businessProfileKey?: string | null
  isPlatformAdmin?: boolean
  operatingModel?: BusinessOperatingModel | null
  /** Resolved plan features; undefined skips plan gating (the API still enforces). */
  planFeatures?: RetailOpsPlanFeature[]
  /** Website & domain launch gate; hidden and redirected unless true. */
  websiteDomainsEnabled?: boolean
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
    description: "Ask questions and continue saved business chats",
    href: "/assistant",
    icon: "assistant",
    label: "Assistant",
    canAccess: canUseRetailOps,
  },
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
    description: "Stock in each store, history and transfers",
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
    canAccess: (role, context) =>
      canOperateInventory(role, context.staffAccessMode),
    children: [
      {
        href: "/inventory/operations",
        icon: "inventory",
        label: "Stock history",
        description: "Every change to your stock",
        canAccess: (role, context) =>
          canOperateInventory(role, context.staffAccessMode),
      },
      {
        href: "/inventory/transfers",
        icon: "inventory",
        label: "Transfers",
        description: "Stock moving between your stores",
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
    description: "Customers, their orders and what they owe",
    href: "/customers",
    icon: "customers",
    label: "Customers",
    canAccess: canUseRetailOps,
  },
  {
    description: "What happened in your Business",
    href: "/activity",
    icon: "activity",
    label: "Activity",
    canAccess: canUseRetailOps,
  },
  {
    description: "Staff invitations and role administration",
    href: "/staff",
    icon: "staff",
    label: "Staff",
    canAccess: canManageCatalog,
    requiresPlanFeature: "staff",
  },
  {
    description: "Spending, money accounts and financial records",
    href: "/finance",
    icon: "analytics",
    label: "Finance",
    canAccess: canManageTenantRole,
    requiresPlanFeature: "finance",
    children: [
      {
        description: "Your money at a glance",
        href: "/finance",
        icon: "analytics",
        label: "Overview",
        canAccess: canManageTenantRole,
      },
      {
        description: "What you spent and still have to pay",
        href: "/finance/spending",
        icon: "analytics",
        label: "Spending",
        canAccess: canManageTenantRole,
      },
      {
        description: "Cash, bank and mobile money",
        href: "/finance/accounts",
        icon: "analytics",
        label: "Money accounts",
        canAccess: canManageTenantRole,
      },
      {
        description: "Check bank lines against your records",
        href: "/finance/bank",
        icon: "analytics",
        label: "Bank",
        canAccess: canManageTenantRole,
      },
      {
        description: "What you owe Suppliers",
        href: "/finance/suppliers",
        icon: "analytics",
        label: "Suppliers",
        canAccess: canManageTenantRole,
        requiresPlanFeature: "suppliers",
      },
      {
        description: "What Customers owe you",
        href: "/customer-ledger",
        icon: "analytics",
        label: "Customer balances",
        canAccess: canManageTenantRole,
        requiresPlanFeature: "finance",
      },
      {
        description: "Profit, money in and out, and exports",
        href: "/finance/reports",
        icon: "analytics",
        label: "Reports",
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
        description: "Business name, currency and who is signed in",
        group: "Business",
        href: "/settings",
        icon: "settings",
        label: "General",
        canAccess: canManageTenantRole,
      },
      {
        description: "Your shops or branches",
        group: "Business",
        href: "/settings/stores",
        icon: "settings",
        label: "Stores",
        canAccess: canManageTenantRole,
      },
      {
        description: "Your plan and what you have used",
        group: "Business",
        href: "/settings/billing",
        icon: "settings",
        label: "Plan and billing",
        canAccess: canManageTenantRole,
      },
      {
        description: "What prints on every receipt",
        group: "Selling",
        href: "/settings/receipts",
        icon: "settings",
        label: "Receipts",
        canAccess: canManageTenantRole,
        requiresPlanFeature: "invoices",
      },
      {
        description: "Who can take returns and give money back",
        group: "Selling",
        href: "/settings/returns",
        icon: "settings",
        label: "Returns and refunds",
        canAccess: canManageTenantRole,
      },
      {
        description: "Customer requests, quotes and bookings",
        group: "Selling",
        href: "/settings/service-commerce",
        icon: "settings",
        label: "Bookings and quotes",
        canAccess: canManageTenantRole,
      },
      {
        description: "Messages staff send from WhatsApp",
        group: "Customers",
        href: "/settings/whatsapp-messages",
        icon: "settings",
        label: "WhatsApp messages",
        canAccess: canManageTenantRole,
      },
      {
        description: "Your online store's web address",
        group: "Customers",
        href: "/settings/domains",
        icon: "settings",
        label: "Domains",
        // canAccess (not isVisible) so direct links redirect too.
        canAccess: (role, context) =>
          context.websiteDomainsEnabled === true && canManageTenantRole(role),
      },
      {
        description: "How customers reach you and who replies",
        group: "Customers",
        href: "/settings/channels",
        icon: "settings",
        label: "Customer channels",
        canAccess: canManageTenantRole,
      },
      {
        description: "Which alerts are on and who gets them",
        group: "Team",
        href: "/settings/notifications",
        icon: "settings",
        label: "Notifications",
        canAccess: canManageTenantRole,
      },
      {
        description: "How your pharmacy handles prescriptions",
        group: "Pharmacy",
        href: "/settings/compliance",
        icon: "settings",
        label: "Pharmacy compliance",
        canAccess: canManageTenantRole,
        isVisible: isPharmacyBusiness,
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
  if (isGeneralAssistantPath(href)) return true
  // Order pages; the API still limits which orders scoped staff can open.
  if (href.startsWith("/sales/orders/")) return true
  return [
    "/",
    // Server reads re-derive each person's own Store/record scope.
    "/activity",
    "/sales",
    "/customers",
    "/inventory",
    "/inventory/operations",
    "/inventory/transfers",
    "/catalog",
  ].includes(href)
}

function isGeneralAssistantPath(pathname: string) {
  return pathname === "/assistant" || /^\/assistant\/c\/[^/]+$/.test(pathname)
}

function hasPlanFeature(
  item: Pick<DashboardNavDefinition, "requiresPlanFeature">,
  context: DashboardNavContext,
) {
  return (
    !item.requiresPlanFeature ||
    !context.planFeatures ||
    context.planFeatures.includes(item.requiresPlanFeature)
  )
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
      !hasPlanFeature(item, context) ||
      (item.isVisible && !item.isVisible(context))
    ) {
      return []
    }

    const {
      canAccess: _canAccess,
      children,
      isVisible: _isVisible,
      requiresPlanFeature: _requiresPlanFeature,
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
  if (pathname.startsWith("/assistant/") && !isGeneralAssistantPath(pathname))
    return normalizedRole !== null && canManageTenant(normalizedRole)
  const matchingPaths = flattenDefinitions(DASHBOARD_NAV).filter((item) =>
    matchesPath(pathname, item.href, item.end),
  )
  // A gated section (e.g. /finance) also gates unlisted pages beneath it.
  if (!matchingPaths.every((item) => hasPlanFeature(item, context))) {
    return false
  }
  const matchedKnownPath = matchingPaths.sort(
    (left, right) => right.href.length - left.href.length,
  )[0]

  if (!matchedKnownPath) {
    return true
  }

  return matchedKnownPath.canAccess(normalizedRole, context)
}

export function getDashboardRoleLabel(role: string | null | undefined) {
  const normalized = getNormalizedRole(role)
  // Owners know Operators as sales reps; the stored role stays OPERATOR.
  return normalized === "OPERATOR"
    ? "Sales rep"
    : getRoleDisplayName(normalized)
}
