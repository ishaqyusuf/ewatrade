import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney, subtractExactDecimals } from "@ewatrade/utils"
import type { CatalogRow } from "./catalog-presentation"
type CatalogItem = RouterOutputs["catalog"]["listItems"][number]

export function mapCatalogItem(
  item: CatalogItem,
  storeId?: string,
): CatalogRow {
  const defaultVariant =
    item.variants.find((variant) => variant.isDefault) ?? item.variants[0]
  const offering = defaultVariant?.offerings[0]
  const currencyCode = offering?.currencyCode ?? "NGN"
  const priceLabel =
    offering?.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
      ? formatMinorMoney(offering.fixedPriceMinor, currencyCode)
      : offering?.pricingPolicy === "quote_required"
        ? "Quote"
        : "Price not set"

  if (item.kind === "service") {
    return {
      detail: `${priceLabel} · No inventory`,
      availabilityLabel: "No inventory",
      id: item.id,
      kind: item.kind,
      name: item.name,
      priceLabel,
      unitName: offering?.name ?? "Service",
    }
  }

  const canonicalUnit =
    item.product?.currentUnitConfiguration?.units.find(
      (unit) => unit.stockBehavior === "canonical_shared",
    ) ?? item.product?.currentUnitConfiguration?.units[0]
  const offeringUnit = item.product?.currentUnitConfiguration?.units.find(
    (unit) => unit.id === offering?.productUnit?.inventoryUnitId,
  )
  const balance = item.product?.stockBalances.find(
    (candidate) =>
      candidate.storeId === storeId &&
      candidate.variantId === defaultVariant?.id &&
      (offeringUnit?.stockBehavior === "packaged_stock"
        ? candidate.kind === "packaged_stock" &&
          candidate.inventoryUnitId === offeringUnit.id
        : candidate.kind === "shared_pool"),
  )
  const unitName = balance?.inventoryUnitName ?? canonicalUnit?.name ?? "unit"
  const availableQuantity = balance
    ? subtractExactDecimals(balance.onHandQuantity, balance.reservedQuantity)
    : null
  const availabilityLabel =
    availableQuantity === null
      ? "Availability not recorded"
      : `${availableQuantity} ${unitName} available`

  return {
    detail: `${availabilityLabel} · ${priceLabel}`,
    availabilityLabel,
    id: item.id,
    kind: item.kind,
    name: item.name,
    priceLabel,
    unitName,
  }
}
