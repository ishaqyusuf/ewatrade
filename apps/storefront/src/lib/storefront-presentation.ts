import { createHash } from "node:crypto"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import type {
  CommerceStudioRoute,
  StorefrontCustomerView,
} from "@ewatrade/storefront-templates/commerce-studio"

export type StorefrontPresentation = {
  snapshot: StorefrontClientSnapshot
  customer: StorefrontCustomerView
  revision: string
  activePage?: string
}

/** Presentation-only digest; no private scope identifiers or receipt tokens. */
export function storefrontPresentation(
  snapshot: StorefrontClientSnapshot,
  customer: StorefrontCustomerView = null,
  pageKey?: string,
  route?: CommerceStudioRoute,
): StorefrontPresentation {
  const { business, contact, catalog, commerce } = snapshot.resources
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        composition: snapshot.composition,
        business,
        contact,
        commerce,
        customer,
        mode: snapshot.mode,
        offeringCounts: catalog.offeringCounts,
      }),
    )
    .digest("hex")
  const detail = catalog.highlightedItem
  return {
    snapshot,
    customer,
    revision,
    activePage:
      route && route.kind !== "page"
        ? route.kind
        : detail
          ? detail.kind === "SERVICE"
            ? "services"
            : "shop"
          : (pageKey ?? "home"),
  }
}
