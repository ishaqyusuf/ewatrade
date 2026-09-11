import type { IconKeys } from "@/components/ui/icon"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"

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
): AdminCreateAction[] {
  return [
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
}
