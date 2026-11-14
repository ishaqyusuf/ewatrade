import { WorkspaceDropdown } from "@/components/dashboard/workspace-dropdown"
import type { TenantContext } from "@/lib/tenant"
import type { ReactNode } from "react"

/**
 * What the Inventory pages show by role: the store picker for businesses with
 * more than one store, and Shipments for owners and admins (its page and its
 * bills use the same gate).
 */
export function inventoryPageAccess(ctx: TenantContext): {
  storePicker: ReactNode
  showShipments: boolean
} {
  return {
    storePicker:
      ctx.stores.length > 1 ? (
        <WorkspaceDropdown ctx={ctx} selection="store" isExpanded />
      ) : null,
    showShipments: ["OWNER", "ADMIN"].includes(
      ctx.membership.role.toUpperCase(),
    ),
  }
}
