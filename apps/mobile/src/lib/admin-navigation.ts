import type { IconKeys } from "@/components/ui/icon"
import type { LinkProps } from "expo-router"

import { normalizeMobileRole } from "./mobile-roles"
import type { MobileWorkspaceFeatureAvailability } from "./workspace-feature-availability"

export type AdminTabKey = "home" | "orders" | "catalog" | "more"
export type AdminCatalogTabLabel = "Products" | "Services" | "Catalog"
export type AdminManagementRole = "OWNER" | "ADMIN" | "MANAGER"

export type AdminTabDefinition = {
  href: LinkProps["href"]
  icon: IconKeys
  key: AdminTabKey
  label: string
  routeName: "admin-home" | "orders" | "catalog" | "more"
  testID: string
}

export type AdminMoreItemId =
  | "inventory"
  | "analytics"
  | "payments-received"
  | "order-reminders"
  | "team"
  | "customers"
  | "service-work"
  | "website-domain"
  | "plan-billing"
  | "app-theme"
  | "app-lock"
  | "sync-offline"
  | "app-updates"
  | "sign-out"

export type AdminMoreItem = {
  action:
    | { href: LinkProps["href"]; kind: "route" }
    | { kind: "theme" }
    | { kind: "sign-out" }
  disabled?: boolean
  icon: IconKeys
  id: AdminMoreItemId
  label: string
}

export type AdminMoreSection = {
  id: "store-tools" | "storefront-plan" | "offline" | "account-settings"
  items: AdminMoreItem[]
  title:
    | "Store tools"
    | "Storefront & plan"
    | "Offline & sync"
    | "Account settings"
}

export function canAccessAdminTabs(role: string | undefined) {
  const normalizedRole = normalizeMobileRole(role)
  return (
    normalizedRole === "OWNER" ||
    normalizedRole === "ADMIN" ||
    normalizedRole === "MANAGER"
  )
}

export function getAdminCatalogTabLabel(
  availability: MobileWorkspaceFeatureAvailability,
): AdminCatalogTabLabel {
  if (availability.hasProductItems && !availability.hasServiceItems) {
    return "Products"
  }
  if (availability.hasServiceItems && !availability.hasProductItems) {
    return "Services"
  }
  return "Catalog"
}

export function getAdminTabDefinitions(
  catalogLabel: AdminCatalogTabLabel,
): AdminTabDefinition[] {
  return [
    {
      href: "/admin-home",
      icon: "House",
      key: "home",
      label: "Home",
      routeName: "admin-home",
      testID: "admin-tab-home",
    },
    {
      href: "/orders" as LinkProps["href"],
      icon: "ReceiptText",
      key: "orders",
      label: "Orders",
      routeName: "orders",
      testID: "admin-tab-orders",
    },
    {
      href: "/catalog" as LinkProps["href"],
      icon: catalogLabel === "Services" ? "Wrench" : "Warehouse",
      key: "catalog",
      label: catalogLabel,
      routeName: "catalog",
      testID: "admin-tab-catalog",
    },
    {
      href: "/more" as LinkProps["href"],
      icon: "more",
      key: "more",
      label: "More",
      routeName: "more",
      testID: "admin-tab-more",
    },
  ]
}

export function getAdminDockLabels(catalogLabel: AdminCatalogTabLabel) {
  const tabs = getAdminTabDefinitions(catalogLabel)
  return [tabs[0]?.label, tabs[1]?.label, "+", tabs[2]?.label, tabs[3]?.label]
}

export function buildAdminMoreSections({
  availability,
  role,
}: {
  availability: MobileWorkspaceFeatureAvailability
  role: AdminManagementRole
}): AdminMoreSection[] {
  const storeItems: AdminMoreItem[] = [
    {
      action: { href: "/stock-intake-modal", kind: "route" },
      disabled: !availability.hasProductItems,
      icon: "Warehouse",
      id: "inventory",
      label: "Inventory",
    },
    {
      action: { href: "/reports-modal", kind: "route" },
      icon: "analytics",
      id: "analytics",
      label: "Analytics",
    },
    {
      action: {
        href: "/payments-received-modal" as LinkProps["href"],
        kind: "route",
      },
      icon: "CreditCard",
      id: "payments-received",
      label: "Payments received",
    },
    {
      action: { href: "/staff-invite-modal", kind: "route" },
      icon: "Users",
      id: "team",
      label: "Team",
    },
    {
      action: { href: "/customer-book-modal", kind: "route" },
      icon: "User",
      id: "customers",
      label: "Customers",
    },
  ]

  if (availability.hasServiceItems || availability.hasServiceJobs) {
    storeItems.push({
      action: { href: "/service-jobs-modal", kind: "route" },
      icon: "Wrench",
      id: "service-work",
      label: "Service work",
    })
  }

  const storefrontItems: AdminMoreItem[] = []
  if (role === "OWNER" || role === "ADMIN") {
    storeItems.push({
      action: {
        href: "/order-reminder-settings-modal" as LinkProps["href"],
        kind: "route",
      },
      icon: "Bell",
      id: "order-reminders",
      label: "Order reminders",
    })
    storefrontItems.push({
      action: {
        href: "/domain-management-modal" as LinkProps["href"],
        kind: "route",
      },
      icon: "Globe",
      id: "website-domain",
      label: "Website & domain",
    })
    storefrontItems.push({
      action: { href: "/subscription-modal", kind: "route" },
      icon: "CreditCard",
      id: "plan-billing",
      label: "Plan & billing",
    })
  }

  const sections: AdminMoreSection[] = [
    {
      id: "store-tools",
      items: storeItems,
      title: "Store tools",
    },
  ]

  if (storefrontItems.length > 0) {
    sections.push({
      id: "storefront-plan",
      items: storefrontItems,
      title: "Storefront & plan",
    })
  }

  sections.push(
    {
      id: "offline",
      items: [
        {
          action: { href: "/sync-status-modal", kind: "route" },
          icon: "RefreshCw",
          id: "sync-offline",
          label: "Sync & offline settings",
        },
      ],
      title: "Offline & sync",
    },
    {
      id: "account-settings",
      items: [
        {
          action: { kind: "theme" },
          icon: "AppWindow",
          id: "app-theme",
          label: "App theme",
        },
        {
          action: { href: "/app-lock-modal", kind: "route" },
          icon: "Lock",
          id: "app-lock",
          label: "App lock",
        },
        {
          action: { href: "/updates", kind: "route" },
          icon: "Download",
          id: "app-updates",
          label: "App updates",
        },
        {
          action: { kind: "sign-out" },
          icon: "LogOut",
          id: "sign-out",
          label: "Sign out",
        },
      ],
      title: "Account settings",
    },
  )

  return sections
}
