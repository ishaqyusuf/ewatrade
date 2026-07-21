import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"

export type GettingStartedAction = {
  description: string
  disabled?: boolean
  href: string
  label: string
}

export function getGettingStartedActions(
  role: string | null | undefined,
  availability: WorkspaceFeatureAvailability,
): GettingStartedAction[] {
  const normalizedRole = normalizeRole(role)
  const canManageCatalog = normalizedRole
    ? canManageSalesOperations(normalizedRole)
    : false
  const canCreateOrders = normalizedRole ? canOperatePos(normalizedRole) : false
  const actions: GettingStartedAction[] = []

  if (canManageCatalog) {
    actions.push(
      {
        description: "Add a stock-tracked item to your Catalog.",
        href: "/catalog?catalogItem=create&catalogKind=product",
        label: "Add Product",
      },
      {
        description: "Add work that you price and deliver.",
        href: "/catalog?catalogItem=create&catalogKind=service",
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

  if (canManageCatalog && !availability.hasStaff) {
    actions.push({
      description: "Invite a team member into this business.",
      href: "/staff?staffSheet=invite",
      label: "Invite staff",
    })
  }

  return actions
}
