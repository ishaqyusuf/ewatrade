import type { CatalogFormGuidance } from "@ewatrade/utils/business-catalog-guidance"

/** Display vocabulary only. Persisted kinds and navigation keep product/service. */
export const MOBILE_CATALOG_LABELS = {
  product: "Goods",
  service: "Services",
  mixed: "Catalog",
} as const

export function catalogItemNoun(kind: "product" | "service") {
  return kind === "service" ? "service" : "item"
}

export function goodsItemCount(count: number) {
  return `${count} goods ${count === 1 ? "item" : "items"}`
}

export function mobileOperatingModelLabel(
  kind: "products" | "services" | "products_and_services",
) {
  if (kind === "products") return MOBILE_CATALOG_LABELS.product
  if (kind === "services") return MOBILE_CATALOG_LABELS.service
  return "Goods and services"
}

/** Only curated shared copy; never pass merchant names, messages or API values. */
export function mobileCatalogSystemCopy(copy: string) {
  return copy
    .replace(/\bProducts\b/g, "Goods")
    .replace(/\bproducts\b/g, "goods")
    .replace(/\bProduct\b/g, "Item")
    .replace(/\bproduct\b/g, "item")
    .replace(/\ba item\b/g, "an item")
    .replace(/\bA item\b/g, "An item")
}

/** Adapt shared form hints without changing kinds, suggestion keys or aliases. */
export function mobileCatalogGuidance(
  guidance: CatalogFormGuidance,
): CatalogFormGuidance {
  return {
    ...guidance,
    name: {
      placeholder: mobileCatalogSystemCopy(guidance.name.placeholder),
      examples: guidance.name.examples.map(mobileCatalogSystemCopy),
    },
    description: {
      placeholder: mobileCatalogSystemCopy(guidance.description.placeholder),
      helperText: mobileCatalogSystemCopy(guidance.description.helperText),
    },
    options: {
      namePlaceholder: mobileCatalogSystemCopy(
        guidance.options.namePlaceholder,
      ),
      helperText: mobileCatalogSystemCopy(guidance.options.helperText),
      suggestedOptions: guidance.options.suggestedOptions.map((option) => ({
        ...option,
        label: mobileCatalogSystemCopy(option.label),
        namePlaceholder: mobileCatalogSystemCopy(option.namePlaceholder),
        helperText: mobileCatalogSystemCopy(option.helperText),
        valuePlaceholder: mobileCatalogSystemCopy(option.valuePlaceholder),
      })),
    },
  }
}
