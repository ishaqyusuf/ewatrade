export type MobileCatalogItemKind = "product" | "service"

export function deriveMobileCatalogFeatureAvailability(
  items: Array<{ kind?: MobileCatalogItemKind }>,
) {
  return {
    hasProductItems: items.some(
      (item) => (item.kind ?? "product") === "product",
    ),
    hasServiceItems: items.some((item) => item.kind === "service"),
  }
}
