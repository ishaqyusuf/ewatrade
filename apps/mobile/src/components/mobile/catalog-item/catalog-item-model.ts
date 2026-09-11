import { formatMinorMoney } from "@ewatrade/utils"
import type { CatalogItem } from "./catalog-item-presentation"

export function catalogItemOfferings(item: CatalogItem) {
  return item.variants.flatMap((variant) =>
    variant.offerings.map((offering) => ({
      offering,
      variant,
      price:
        offering.pricingPolicy === "quote_required"
          ? "Quote required"
          : offering.fixedPriceMinor === null
            ? "Price not set"
            : formatMinorMoney(offering.fixedPriceMinor, offering.currencyCode),
    })),
  )
}
export function catalogItemUnavailable({
  isOffline,
  isPending,
  errorMessage,
}: {
  isOffline: boolean
  isPending: boolean
  errorMessage?: string
}) {
  return {
    title: isOffline
      ? "Overview unavailable offline"
      : isPending
        ? "Loading overview"
        : "Overview unavailable",
    message: isOffline
      ? "Reconnect to load this Product or Service."
      : isPending
        ? "Loading the latest Catalog details."
        : (errorMessage ?? "Catalog item not found."),
  }
}
