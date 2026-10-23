import {
  type StorefrontCapabilities,
  type StorefrontResources,
  unavailableCapabilities,
} from "../../storefront-contracts/src/resources"

export type FixtureName = "populated" | "empty" | "unavailable"
const business = {
  name: "Fixture Store",
  slug: "fixture-store",
  description: "Synthetic fixture data.",
}
const on = { available: true }
const item = (
  id: string,
  name: string,
  kind: "PRODUCT" | "SERVICE",
  priceMinor: number | null,
) => ({
  id,
  name,
  kind,
  description: null,
  category: { id: "cat-1", name: "General" },
  illustrationId: "default",
  currencyCode: "NGN",
  priceMinor,
  isFromPrice: false,
  availability: null,
  options: [],
})

/** Synthetic data only: no tenant, DB or provider values. */
export function fixture(name: FixtureName): {
  resources: StorefrontResources
  capabilities: StorefrontCapabilities
} {
  const items =
    name === "populated"
      ? [
          item("item-1", "Ankara tote", "PRODUCT", 1500000),
          item("item-2", "Tailoring fitting", "SERVICE", null),
        ]
      : []
  return {
    resources: {
      business,
      catalog: {
        items,
        highlightedItem: null,
        categories: items.length ? [{ id: "cat-1", name: "General" }] : [],
        category: null,
        nextCursor: null,
        hasHiddenItems: false,
      },
      contact: { chatToken: null, whatsAppPhone: null },
      assets: {},
    },
    capabilities:
      name === "unavailable"
        ? unavailableCapabilities()
        : {
            catalog: on,
            services: on,
            conversation:
              name === "populated"
                ? on
                : { available: false, reason: "Chat is off." },
            whatsappEnquiry: { available: false, reason: "Not connected." },
            serviceRequest: { available: false, reason: "No service entry." },
          },
  }
}
