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
        description: "Something you sell and keep in stock.",
        catalogCreateKind: "product",
        href: "/?catalogItem=create&catalogCreateKind=product",
        label: "Add a product",
      },
      {
        description: "Work you do for customers, like a visit or a repair.",
        catalogCreateKind: "service",
        href: "/?catalogItem=create&catalogCreateKind=service",
        label: "Add a service",
      },
    )
  }

  if (canCreateOrders) {
    actions.push({
      description: availability.hasActiveSellableItems
        ? "Sell a product or service you have added."
        : "Pick items or type a price.",
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
      description: "Give a team member access to this business.",
      href: "/staff?staffSheet=invite",
      label: "Invite staff",
    })
  }

  return actions
}
