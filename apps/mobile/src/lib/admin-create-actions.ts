import type { IconKeys } from "@/components/ui/icon"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import {
  canEditMobileCatalog,
  canManageMobileStaff,
  canManageMobileStock,
  normalizeMobileRole,
} from "./mobile-roles"

export type AdminCreateAction = {
  detail: string
  disabled: boolean
  emphasis: "catalog" | "standard"
  icon: IconKeys
  label: string
  route: string
  statusLabel?: string
}

export function buildAdminCreateActions(
  availability: MobileWorkspaceFeatureAvailability,
  isOffline: boolean,
  profile?: {
    role?: string
    staffAccessMode?: "LEGACY" | "SCOPED"
    catalogEditor?: boolean
  } | null,
): AdminCreateAction[] {
  const actions: AdminCreateAction[] = [
    {
      detail: "A stock-tracked item you sell.",
      disabled: isOffline,
      emphasis: "catalog",
      icon: "FolderPlus",
      label: "Product",
      route: "/first-product-setup-modal?kind=product",
      statusLabel: isOffline ? "Online only" : undefined,
    },
    {
      detail: "Work you price and deliver.",
      disabled: isOffline,
      emphasis: "catalog",
      icon: "Briefcase",
      label: "Service",
      route: "/first-product-setup-modal?kind=service",
      statusLabel: isOffline ? "Online only" : undefined,
    },
    {
      detail: "Open your customer book.",
      disabled: false,
      emphasis: "standard",
      icon: "UserPlus",
      label: "Customer",
      route: "/customer-book-modal",
    },
    {
      detail: "Invite a team member.",
      disabled: false,
      emphasis: "standard",
      icon: "Users",
      label: "Staff",
      route: "/staff-invite-modal",
    },
    {
      detail: availability.hasActiveSellableItems
        ? "Create an order from active Products or Services."
        : "Add a Product or Service first.",
      disabled: !availability.hasActiveSellableItems,
      emphasis: "standard",
      icon: "ReceiptText",
      label: "Order",
      route: "/create-sale-modal",
      statusLabel: availability.hasActiveSellableItems
        ? undefined
        : "First item",
    },
    {
      detail: availability.hasProductItems
        ? "Receive, count, adjust, or assign stock."
        : "Add a Product to unlock stock.",
      disabled: !availability.hasProductItems,
      emphasis: "standard",
      icon: "Warehouse",
      label: "Stock Entry",
      route: "/stock-intake-modal",
      statusLabel: availability.hasProductItems ? undefined : "Product",
    },
  ]
  if (!profile) return actions
  const scopedStaff =
    profile.staffAccessMode === "SCOPED" &&
    !["OWNER", "ADMIN"].includes(normalizeMobileRole(profile.role))
  return actions.filter((action) => {
    if (action.label === "Product" || action.label === "Service")
      return canEditMobileCatalog(profile)
    if (action.label === "Staff") return canManageMobileStaff(profile)
    if (action.label === "Customer") return !scopedStaff
    if (action.label === "Stock Entry")
      return canManageMobileStock(profile.role, profile.staffAccessMode)
    return true
  })
}
