import releaseConfig from "./release-config.json"
import {
  isMobileDesign,
  isMobileDesignScreen,
  type MobileDesign,
  type MobileDesignScreen,
} from "./screens"

// Source integration only. Deferred acceptance is tracked in the Scratch ticket.
export const MODULARIZED_SCREENS: ReadonlySet<MobileDesignScreen> = new Set([
  "startup-splash",
  "onboarding",
  "staff-onboarding",
  "login",
  "sign-up",
  "verify-email",
  "app-lock",
  "business-home",
  "sales-rep-home",
  "orders",
  "order-detail",
  "catalog",
  "catalog-item",
  "more",
  "global-search",
  "updates",
  "create-sale",
  "closeout",
  "first-product",
  "new-business",
  "catalog-picker",
  "stock-intake",
  "unit-conversion",
  "service-jobs",
  "customers",
  "staff",
  "business-switch",
])

export const MOBILE_DESIGN_RELEASE: {
  defaultDesign: MobileDesign
  screens: Partial<Record<MobileDesignScreen, MobileDesign>>
} = {
  defaultDesign: isMobileDesign(releaseConfig.defaultDesign)
    ? releaseConfig.defaultDesign
    : "classic",
  screens: Object.fromEntries(
    Object.entries(releaseConfig.screens).filter(
      ([screen, design]) =>
        isMobileDesignScreen(screen) && isMobileDesign(design),
    ),
  ),
}
