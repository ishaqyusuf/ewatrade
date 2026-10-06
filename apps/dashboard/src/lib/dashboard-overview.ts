import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"

export type GettingStartedAction = {
  catalogCreateKind?: "product" | "service"
  description: string
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
        description: "Add a stock-tracked item to your Catalog.",
        catalogCreateKind: "product",
        href: "/?catalogItem=create&catalogCreateKind=product",
        label: "Add Product",
      },
      {
        description: "Add work that you price and deliver.",
        catalogCreateKind: "service",
        href: "/?catalogItem=create&catalogCreateKind=service",
        label: "Add Service",
      },
    )
  }

  if (canCreateOrders) {
    actions.push({
      description: availability.hasActiveSellableItems
        ? "Create an order from an active Product or Service."
        : "Add an active fixed-price item before creating an order.",
      disabled: !availability.hasActiveSellableItems,
      href: "/sales?orderSheet=create",
      label: "Create first order",
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
      description: "Invite a team member into this business.",
      href: "/staff?staffSheet=invite",
      label: "Invite staff",
    })
  }

  return actions
}
