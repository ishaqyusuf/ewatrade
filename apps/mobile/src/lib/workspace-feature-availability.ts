import type { MobileSession } from "@/lib/session-store"
import type { RetailOpsBusiness } from "@/store/businessStore"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type MobileWorkspaceFeatureAvailability =
  RouterOutputs["tenant"]["featureAvailability"]

export type MobileProvisionalFeaturePresence = {
  catalogItems: unknown[]
  commercialOrders: number
  customers: number
  inventoryOperations: number
  serviceOperations: number
}

type MobileDashboardNavigation = {
  centralActionLabel: "Add" | "New order"
  navItemLabels: readonly ("Catalog" | "Home" | "Reports" | "Work")[]
}

const EMPTY_AVAILABILITY: MobileWorkspaceFeatureAvailability = {
  hasActiveSellableItems: false,
  hasCatalogItems: false,
  hasCustomers: false,
  hasInventoryActivity: false,
  hasOrders: false,
  hasProductItems: false,
  hasReportableActivity: false,
  hasServiceItems: false,
  hasServiceJobs: false,
  hasStaff: false,
  storeId: "",
}

export function mergeMobileWorkspaceFeatureAvailability(
  authoritative: MobileWorkspaceFeatureAvailability | undefined,
  provisional: MobileProvisionalFeaturePresence,
): MobileWorkspaceFeatureAvailability {
  const current = authoritative ?? EMPTY_AVAILABILITY
  const hasProvisionalCatalog = provisional.catalogItems.length > 0
  const hasOrders = current.hasOrders || provisional.commercialOrders > 0
  const hasInventoryActivity =
    current.hasInventoryActivity || provisional.inventoryOperations > 0
  const hasServiceJobs =
    current.hasServiceJobs || provisional.serviceOperations > 0

  return {
    ...current,
    hasCatalogItems: current.hasCatalogItems || hasProvisionalCatalog,
    hasCustomers: current.hasCustomers || provisional.customers > 0,
    hasInventoryActivity,
    hasOrders,
    hasProductItems: current.hasProductItems || hasProvisionalCatalog,
    hasReportableActivity:
      current.hasReportableActivity ||
      hasOrders ||
      hasInventoryActivity ||
      hasServiceJobs,
    hasServiceJobs,
  }
}

export function getMobileDashboardFeatureVisibility(
  availability: MobileWorkspaceFeatureAvailability,
  isAttendant: boolean,
) {
  return {
    showGettingStarted: !isAttendant && !availability.hasOrders,
    showOrderHistory: availability.hasOrders,
  }
}

export function getMobileDashboardNavigation(
  isAttendant: boolean,
): MobileDashboardNavigation {
  return isAttendant
    ? {
        centralActionLabel: "New order" as const,
        navItemLabels: ["Home", "Work"] as const,
      }
    : {
        centralActionLabel: "Add" as const,
        navItemLabels: ["Home", "Catalog", "Work", "Reports"] as const,
      }
}

export function switchMobileBusinessSession(
  session: MobileSession,
  business: RetailOpsBusiness,
): MobileSession {
  return {
    ...session,
    profile: {
      ...session.profile,
      businessId: business.id,
      businessName: business.name,
      businessSlug: business.slug,
      currencyCode: business.currency,
      role: business.role,
    },
  }
}
