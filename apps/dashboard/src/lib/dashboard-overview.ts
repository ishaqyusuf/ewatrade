import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"

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

/** Milliseconds `timeZone` is ahead of UTC at `at`. */
function zoneOffset(at: number, timeZone: string) {
  const parts: Record<string, number> = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, Number(part.value)]),
  )
  const part = (type: string) => parts[type] ?? 0
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  )
  return asUtc - Math.floor(at / 1000) * 1000
}

/** Start of today and of this month in the business's time zone. */
export function getOverviewPeriods(timeZone: string, now = new Date()) {
  const offset = zoneOffset(now.getTime(), timeZone)
  const local = new Date(now.getTime() + offset)
  const midnight = (day: number) => {
    const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), day)
    // Re-read the offset at the guess so a DST change that day stays exact.
    return new Date(guess - zoneOffset(guess - offset, timeZone))
  }
  return {
    todayStart: midnight(local.getUTCDate()),
    monthStart: midnight(1),
  }
}
