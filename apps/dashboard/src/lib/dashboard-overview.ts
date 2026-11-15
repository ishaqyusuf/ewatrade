import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"
import { businessDayKey, businessDayStart } from "@ewatrade/utils/business-day"

export type GettingStartedAction = {
  catalogCreateKind?: "product" | "service"
  disabled?: boolean
  href: string
  label: string
}

export function getGettingStartedActions(
  role: string | null | undefined,
  availability: WorkspaceFeatureAvailability,
  scope?: { staffAccessMode?: string; catalogEditor?: boolean },
): GettingStartedAction[] {
  const normalizedRole = normalizeRole(role)
  const canManageCatalog = normalizedRole
    ? scope?.staffAccessMode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(normalizedRole)
      ? scope.catalogEditor === true
      : canManageSalesOperations(normalizedRole)
    : false
  const canCreateOrders = normalizedRole ? canOperatePos(normalizedRole) : false
  const actions: GettingStartedAction[] = []

  if (canManageCatalog) {
    actions.push(
      {
        catalogCreateKind: "product",
        href: "/?catalogItem=create&catalogCreateKind=product",
        label: "Add an item",
      },
      {
        catalogCreateKind: "service",
        href: "/?catalogItem=create&catalogCreateKind=service",
        label: "Add a service",
      },
    )
  }

  if (canCreateOrders) {
    actions.push({
      disabled: false,
      href: "/sales?orderSheet=create",
      label: "Create your first order",
    })
  }

  if (
    canManageCatalog &&
    !availability.hasStaff &&
    (scope?.staffAccessMode !== "SCOPED" ||
      normalizedRole === "OWNER" ||
      normalizedRole === "ADMIN")
  ) {
    actions.push({
      href: "/staff?staffSheet=invite",
      label: "Invite staff",
    })
  }

  return actions
}

/**
 * Who sees what on the Overview. Sales numbers and recent orders follow the
 * Sales page's own rule (people who can sell); Support and Member roles never
 * see store money. Needs you, the setup list, nudges and the online store are
 * for Owners and Admins.
 */
export function getOverviewAccess(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  return {
    sales: normalized ? canOperatePos(normalized) : false,
    owner: normalized === "OWNER" || normalized === "ADMIN",
  }
}

/** Start of today and of this month in the business's time zone. */
export function getOverviewPeriods(timeZone: string, now = new Date()) {
  // The same business days as Reports and Activity (DST-safe).
  const today = businessDayKey(now, timeZone)
  return {
    todayStart: businessDayStart(today, timeZone),
    monthStart: businessDayStart(`${today.slice(0, 8)}01`, timeZone),
  }
}
