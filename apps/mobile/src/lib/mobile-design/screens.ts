export const MOBILE_DESIGN_SCREENS = {
  "startup-splash": "Startup splash",
  onboarding: "Business onboarding",
  login: "Login",
  "sign-up": "Sign up",
  "verify-email": "Verify email",
  "staff-onboarding": "Staff onboarding",
  "app-lock": "App lock",
  "business-home": "Business Home",
  "sales-rep-home": "Sales rep Home",
  orders: "Orders",
  "order-detail": "Order detail and actions",
  catalog: "Catalog and category selection",
  "catalog-item": "Catalog item detail",
  more: "More and settings",
  "global-search": "Global search",
  updates: "Updates",
  "create-sale": "Create sale",
  closeout: "Closeout",
  "first-product": "First product setup",
  "new-business": "New business setup",
  "catalog-picker": "Catalog browser modal",
  "stock-intake": "Stock intake",
  "unit-conversion": "Unit conversion",
  "service-jobs": "Service jobs",
  customers: "Customer book",
  staff: "Staff invite",
  "business-switch": "Business switch",
  subscription: "Subscription",
  website: "Website and domain",
  reports: "Reports",
  payments: "Payments received",
  "order-reminders": "Order reminders",
  sync: "Sync and offline",
  "customer-conversations": "Customer conversations",
  "customer-conversation": "Customer conversation detail",
  "store-entry": "Store conversation entry",
  "operation-success": "Operation success",
  "not-found": "Not found",
} as const

export type MobileDesignScreen = keyof typeof MOBILE_DESIGN_SCREENS
export type MobileDesign = "classic" | "market-day"

export function isMobileDesign(value: unknown): value is MobileDesign {
  return value === "classic" || value === "market-day"
}

export function isMobileDesignScreen(
  value: string,
): value is MobileDesignScreen {
  return Object.hasOwn(MOBILE_DESIGN_SCREENS, value)
}
