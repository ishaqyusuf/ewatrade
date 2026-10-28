import { readStorefrontFeatureConfig } from "@ewatrade/storefront-contracts/features"
import type { StorefrontRoute } from "@ewatrade/storefront-contracts/routes"
import type { StorefrontFeaturePresentation } from "@ewatrade/storefront-runtime/feature-theme"
import { storefrontFeatureTokens } from "@ewatrade/storefront-runtime/feature-theme"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  commerceThemeStyle,
  headerSettings,
} from "../commerce-studio/presentation"

/** Trusted family adapters own branding. No feature implementation selects templates. */
export function storefrontFeaturePresentation(
  snapshot: StorefrontClientSnapshot,
): StorefrontFeaturePresentation {
  if (snapshot.composition.template.key === "commerce-studio")
    return {
      details: headerSettings(snapshot.composition),
      style: commerceThemeStyle(snapshot.composition.theme),
    }
  const config = readStorefrontFeatureConfig(snapshot.composition)
  return {
    details: {
      tagline: "",
      location: "",
      hours: "",
      deliveryNote: "",
      showLogin: true,
      offerPickup: config?.orders.fulfilment.includes("pickup") ?? false,
      offerDelivery: config?.orders.fulfilment.includes("delivery") ?? false,
    },
    style: {
      ...storefrontFeatureTokens(snapshot.composition.theme),
      "--sf-feature-font-body": "system-ui, sans-serif",
      "--sf-feature-font-heading":
        snapshot.composition.theme.font === "serif"
          ? "Georgia, serif"
          : "system-ui, sans-serif",
    } as StorefrontFeaturePresentation["style"],
  }
}

export function storefrontSharedDetail(snapshot: StorefrontClientSnapshot) {
  return snapshot.composition.schemaVersion === 2
    ? snapshot.resources.catalog.highlightedItem
    : null
}

export function storefrontUsesFeaturePage(
  snapshot: StorefrontClientSnapshot,
  route?: StorefrontRoute,
) {
  return Boolean(
    (route && route.kind !== "page") || storefrontSharedDetail(snapshot),
  )
}
