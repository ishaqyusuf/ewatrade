import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney, subtractExactDecimals } from "@ewatrade/utils"
import { selectCatalogAvatar } from "./catalog-avatar-model"
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
  const avatar = selectCatalogAvatar(
    item,
    storeId,
    defaultVariant?.imageUrl ?? item.imageUrl,
  )
  const priceLabel =
    offering?.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
      ? formatMinorMoney(offering.fixedPriceMinor, currencyCode).replace(
          /\.00(?=\D*$)/,
          "",
        )
      : offering?.pricingPolicy === "quote_required"
        ? "Quote"
        : "Price not set"

  if (item.kind === "service") {
    return {
      avatar,
      problem: priceLabel === "Price not set" ? "no_price" : undefined,
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
    avatar,
    problem:
      priceLabel === "Price not set"
        ? "no_price"
        : availableQuantity === null
          ? "not_counted"
          : Number(availableQuantity) <= 0
            ? "out_of_stock"
            : undefined,
    detail: `${availabilityLabel} · ${priceLabel}`,
    availabilityLabel,
    id: item.id,
    kind: item.kind,
    name: item.name,
    priceLabel,
    unitName,
  }
}
